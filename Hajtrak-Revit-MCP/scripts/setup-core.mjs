import fs from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";

const ownedNames = [
  "RevitMCPAddin.addin", "RevitMCPAddin.dll", "RevitMCP.Core.dll",
  "RevitMCPAddin.deps.json", "Microsoft.Web.WebView2.Core.dll",
  "Microsoft.Web.WebView2.Wpf.dll", "WebView2Loader.dll",
];
const sharedNames = new Set([
  "Microsoft.Web.WebView2.Core.dll", "Microsoft.Web.WebView2.Wpf.dll", "WebView2Loader.dll",
]);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const read = (file) => fs.existsSync(file) ? fs.readFileSync(file) : null;
const digest = (bytes) => bytes === null ? null : sha(bytes);
const encode = (bytes) => bytes === null ? null : bytes.toString("base64");
const decode = (value) => value === null ? null : Buffer.from(value, "base64");
const json = (value) => Buffer.from(JSON.stringify(value, null, 2));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

// The configuration is edited by table, preserving unrelated text exactly.
// Refuse TOML constructs this scoped editor cannot interpret safely.
export function configParts(text) {
  if (/'''|"""/.test(text)) throw new Error("Configuration contains multiline TOML strings. A manual configuration merge is required.");
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const blocks = [];
  let block = { key: null, text: "" };
  for (const line of lines) {
    if (/^\s*\[/.test(line)) {
      const header = line.trim().replace(/\s+#.*$/, "");
      if (/revit-2026/i.test(header) && !/^\[mcp_servers\.revit-2026(?:\.[A-Za-z0-9_.-]+)?\]$/.test(header)) {
        throw new Error("The revit-2026 table uses unsupported quoting or syntax. A manual configuration merge is required.");
      }
      blocks.push(block);
      block = { key: header.slice(1, -1), text: "" };
    }
    block.text += line;
  }
  blocks.push(block);
  const selected = blocks.filter(({ key }) => key === "mcp_servers.revit-2026" || key?.startsWith("mcp_servers.revit-2026."));
  if (new Set(selected.map(({ key }) => key)).size !== selected.length) throw new Error("Duplicate Revit MCP configuration tables.");
  return { blocks, selected };
}

function replaceTables(text, tables) {
  const { blocks } = configParts(text);
  const result = blocks.filter(({ key }) => key !== "mcp_servers.revit-2026" && !key?.startsWith("mcp_servers.revit-2026."))
    .map(({ text: content }) => content).join("");
  return result + (result && !result.endsWith("\n") ? "\n" : "") + tables.map(({ text: content }) => content).join("");
}

function within(root, relative) {
  if (path.isAbsolute(relative)) throw new Error("Absolute package path rejected.");
  const target = path.resolve(root, relative);
  if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error("Package path escapes its directory.");
  return target;
}

function atomicWrite(file, bytes) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (bytes === null) {
    if (fs.existsSync(file)) fs.unlinkSync(file);
    return;
  }
  const temporary = file + "." + randomUUID() + ".tmp";
  try {
    fs.writeFileSync(temporary, bytes, { flag: "wx" });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

export class Setup {
  constructor({ root, addins, config, requireClosed = () => {}, progress = () => {} }) {
    this.root = path.resolve(root);
    this.addins = path.resolve(addins);
    this.config = path.resolve(config);
    this.requireClosed = requireClosed;
    this.progress = progress;
    this.record = path.join(this.root, "setup-state.json");
    this.pending = path.join(this.root, "setup-pending.json");
  }

  state() {
    return fs.existsSync(this.record) ? JSON.parse(fs.readFileSync(this.record, "utf8")) : null;
  }

  status() {
    const state = this.state();
    const problems = [];
    if (fs.existsSync(this.pending)) problems.push("An interrupted operation needs recovery. Choose Repair.");
    if (state) {
      for (const [name, hash] of Object.entries(state.hashes ?? {})) {
        if (digest(read(path.join(this.addins, name))) !== hash) problems.push(name + " differs from the installation record.");
      }
      if (state.tables && !same(configParts(read(this.config)?.toString("utf8") ?? "").selected, state.tables)) {
        problems.push("The Revit Codex configuration has changed.");
      }
      if (state.installed && !fs.existsSync(path.join(state.package, "McpServer", "dist", "index.js"))) problems.push("The installed bridge is missing.");
    }
    return { installed: Boolean(state?.installed), package: state?.package ?? null,
      managed: Boolean(state), canRollback: Boolean(state?.previous), problems };
  }

  validatePackage(source) {
    const manifest = JSON.parse(fs.readFileSync(path.join(source, "package-manifest.json"), "utf8"));
    if (manifest.version !== "0.9.0" || manifest.toolCount !== 98 || !Array.isArray(manifest.files)) {
      throw new Error("This setup requires a validated Revit MCP 0.9.0 package with 98 tools.");
    }
    const files = new Map();
    for (const entry of manifest.files) {
      const relative = entry.path.replaceAll("\\", "/");
      if (files.has(relative.toLowerCase())) throw new Error("Duplicate package file.");
      const file = within(source, relative);
      let parent = file;
      while (parent !== path.resolve(source)) {
        if (fs.lstatSync(parent).isSymbolicLink()) throw new Error("Package links are unsupported.");
        parent = path.dirname(parent);
      }
      if (sha(fs.readFileSync(file)) !== entry.sha256.toLowerCase()) throw new Error("Package verification failed for " + relative);
      files.set(relative.toLowerCase(), { relative, file, hash: entry.sha256.toLowerCase() });
    }
    for (const required of ["McpServer/dist/index.js", "Addin/RevitMCPAddin.addin", ...ownedNames.slice(1).map((name) => this.runtimeRelative(name))]) {
      if (!files.has(required.toLowerCase())) throw new Error("Package is missing " + required);
    }
    return { manifest, files };
  }

  runtimeRelative(name) {
    return "Addin/Runtime/" + (name === "WebView2Loader.dll" ? "runtimes/win-x64/native/" : "") + name;
  }

  withLock(action) {
    fs.mkdirSync(this.root, { recursive: true });
    const lock = path.join(this.root, "setup.lock");
    if (fs.existsSync(lock)) {
      let owner;
      try { owner = JSON.parse(fs.readFileSync(lock, "utf8")).pid; }
      catch { throw new Error("Setup lock is unreadable. Inspect " + lock + " before retrying."); }
      if (!Number.isInteger(owner) || owner <= 0) throw new Error("Invalid setup lock.");
      try { process.kill(owner, 0); }
      catch (error) {
        if (error.code === "ESRCH") fs.unlinkSync(lock);
        else throw new Error("Could not verify the process holding the setup lock.");
      }
    }
    let handle;
    try { handle = fs.openSync(lock, "wx"); }
    catch { throw new Error("Another setup operation is running, or its lock remains after an interruption. Close setup and inspect " + lock); }
    try {
      fs.writeFileSync(handle, JSON.stringify({ pid: process.pid }));
      return action();
    }
    finally { fs.closeSync(handle); fs.unlinkSync(lock); }
  }

  recover() {
    if (!fs.existsSync(this.pending)) return;
    this.requireClosed();
    const pending = JSON.parse(fs.readFileSync(this.pending, "utf8"));
    // Recovery only touches known installation files and the scoped config tables.
    for (const item of pending.files) {
      if (!ownedNames.includes(item.name)) throw new Error("Invalid recovery record.");
      const current = read(path.join(this.addins, item.name));
      if (![item.beforeHash, item.afterHash].includes(digest(current))) {
        throw new Error("Recovery stopped because " + item.name + " changed independently.");
      }
    }
    const currentConfig = read(this.config)?.toString("utf8") ?? "";
    const currentTables = configParts(currentConfig).selected;
    if (!same(currentTables, pending.beforeTables) && !same(currentTables, pending.afterTables)) {
      throw new Error("Recovery stopped because the Revit configuration changed independently.");
    }
    for (const item of pending.files) atomicWrite(path.join(this.addins, item.name), decode(item.before));
    atomicWrite(this.config, Buffer.from(replaceTables(currentConfig, pending.beforeTables)));
    atomicWrite(this.record, decode(pending.beforeState));
    fs.unlinkSync(this.pending);
    this.progress("Recovered the interrupted operation.");
  }

  commit(files, tables, nextState) {
    const configBefore = read(this.config)?.toString("utf8") ?? "";
    const beforeTables = configParts(configBefore).selected;
    const entries = Object.entries(files).map(([name, after]) => {
      const before = read(path.join(this.addins, name));
      return { name, before: encode(before), beforeHash: digest(before), afterHash: digest(after) };
    });
    const snapshot = { files: entries, tables: beforeTables, state: this.state() };
    const pending = { files: entries, beforeTables, afterTables: tables, beforeState: encode(read(this.record)) };
    atomicWrite(this.pending, json(pending));
    try {
      for (const [name, bytes] of Object.entries(files)) atomicWrite(path.join(this.addins, name), bytes);
      const current = read(this.config)?.toString("utf8") ?? "";
      if (!same(configParts(current).selected, beforeTables)) throw new Error("Revit configuration changed during setup.");
      atomicWrite(this.config, Buffer.from(replaceTables(current, tables)));
      for (const [name, bytes] of Object.entries(files)) {
        if (digest(read(path.join(this.addins, name))) !== digest(bytes)) throw new Error("Installed file verification failed.");
      }
      atomicWrite(this.record, json({ ...nextState, tables,
        hashes: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, digest(bytes)])),
        previous: snapshot }));
      fs.unlinkSync(this.pending);
    } catch (error) {
      try { this.recover(); }
      catch (recoveryError) { throw new Error(error.message + " Recovery also needs attention: " + recoveryError.message); }
      throw error;
    }
  }

  install(source) {
    return this.withLock(() => {
      this.requireClosed();
      this.recover();
      const old = this.state();
      const currentManifest = read(path.join(this.addins, "RevitMCPAddin.addin"))?.toString("utf8");
      if (currentManifest && !currentManifest.includes("9C4D2B7E-3F1A-4E5C-8B6D-1A2C3D4E5F60")) {
        throw new Error("The existing add-in manifest belongs to a different installation.");
      }
      if (!currentManifest && !old && ownedNames.some((name) => fs.existsSync(path.join(this.addins, name)))) {
        throw new Error("Existing runtime files have no recognised manifest. Resolve their ownership before installation.");
      }
      const text = read(this.config)?.toString("utf8") ?? "";
      const tables = configParts(text).selected;
      if (tables.length && !old && !tables.some(({ text: table }) => /RevitMCP[./\\]|RevitMCP\.Custom/.test(table))) {
        throw new Error("The existing revit-2026 configuration is not a recognised Revit MCP installation.");
      }
      this.progress("Verifying the package...");
      const { manifest, files: packageFiles } = this.validatePackage(path.resolve(source));
      const destination = path.join(this.root, "packages", randomUUID());
      this.progress("Copying the verified package...");
      for (const { relative, file, hash } of packageFiles.values()) {
        const output = within(destination, relative);
        fs.mkdirSync(path.dirname(output), { recursive: true });
        fs.copyFileSync(file, output, fs.constants.COPYFILE_EXCL);
        if (digest(read(output)) !== hash) throw new Error("Package copy verification failed.");
      }
      atomicWrite(path.join(destination, "package-manifest.json"), json(manifest));
      const files = {};
      for (const name of ownedNames.slice(1)) files[name] = read(path.join(destination, this.runtimeRelative(name)));
      const template = fs.readFileSync(path.join(destination, "Addin", "RevitMCPAddin.addin"), "utf8");
      const assembly = path.join(this.addins, "RevitMCPAddin.dll").replaceAll("&", "&amp;").replaceAll("<", "&lt;");
      files["RevitMCPAddin.addin"] = Buffer.from(template.replace(/<Assembly>[^<]*<\/Assembly>/, "<Assembly>" + assembly + "</Assembly>"));
      const entry = path.join(destination, "McpServer", "dist", "index.js").replaceAll("\\", "/");
      const newTable = {
        key: "mcp_servers.revit-2026",
        text: '[mcp_servers.revit-2026]\ncommand = "node"\nargs = [' + JSON.stringify(entry) + ']\nenv = { REVIT_MCP_VERSION = "2026", REVIT_MCP_PORT = "7891" }\n',
      };
      // Keep existing approval settings and other server options when replacing command and environment.
      const existing = tables.find(({ key }) => key === newTable.key);
      if (existing) {
        if (/^\s*(url|bearer_token_env_var)\s*=/m.test(existing.text)) throw new Error("Existing HTTP server settings require a manual migration.");
        const argLines = existing.text.match(/^\s*args\s*=.*$/gm) ?? [];
        if (argLines.length !== 1 || !/\]\s*(?:#.*)?$/.test(argLines[0])) throw new Error("Multiline command arguments require a manual merge.");
        newTable.text = existing.text
          .replace(/^\s*command\s*=.*$/m, 'command = "node"')
          .replace(/^\s*args\s*=.*$/m, "args = [" + JSON.stringify(entry) + "]");
        if (!/^\s*command\s*=/m.test(newTable.text)) newTable.text += '\ncommand = "node"\n';
        if (!newTable.text.endsWith("\n")) newTable.text += "\n";
      }
      const updatedTables = [newTable, ...tables.filter(({ key }) => key !== newTable.key)];
      const next = { schema: 1, installed: true, package: destination, tables: updatedTables,
        hashes: Object.fromEntries(Object.entries(files).map(([name, bytes]) => [name, digest(bytes)])) };
      this.progress("Installing files and updating the Revit entry in Codex...");
      this.commit(files, updatedTables, next);
      return this.status();
    });
  }

  rollback() {
    return this.withLock(() => {
      this.requireClosed();
      this.recover();
      const state = this.state();
      if (!state?.previous) throw new Error("No setup operation is available to roll back.");
      if (this.status().problems.length) throw new Error("Installed files or Revit settings changed. Resolve the reported differences before rollback.");
      const snapshot = state.previous;
      const files = Object.fromEntries(snapshot.files.map(({ name, before }) => [name, decode(before)]));
      const previous = snapshot.state ?? { schema: 1, installed: false };
      this.commit(files, snapshot.tables, previous);
      return this.status();
    });
  }

  uninstall() {
    return this.withLock(() => {
      this.requireClosed();
      this.recover();
      const state = this.state();
      if (!state?.installed) throw new Error("Install or Repair once to register this installation before uninstalling.");
      if (this.status().problems.length) throw new Error("Installed files or Revit settings changed. Use Status to inspect them before uninstalling.");
      const files = {};
      for (const name of ownedNames) if (!sharedNames.has(name)) files[name] = null;
      this.commit(files, [], { schema: 1, installed: false, package: state.package, hashes: {}, tables: [] });
      return this.status();
    });
  }
}

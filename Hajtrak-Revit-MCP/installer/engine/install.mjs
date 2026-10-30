import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const serverKey = "hajtrak-revit-2026";
export const addinId = "9C4D2B7E-3F1A-4E5C-8B6D-1A2C3D4E5F60";
const runtimeNames = ["RevitMCPAddin.dll", "RevitMCP.Core.dll", "RevitMCPAddin.deps.json",
  "Microsoft.Web.WebView2.Core.dll", "Microsoft.Web.WebView2.Wpf.dll", "WebView2Loader.dll"];
const digest = b => crypto.createHash("sha256").update(b).digest("hex");
const read = p => fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
const inside = (base, child) => {
  const relative = path.relative(path.resolve(base), path.resolve(child));
  if (relative === "" || relative.startsWith(".." + path.sep) || relative === ".." || path.isAbsolute(relative))
    throw new Error("Path escapes its managed directory.");
  return path.resolve(child);
};
function atomicWrite(file, contents) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + ".hajtrak-" + crypto.randomUUID();
  fs.writeFileSync(temp, contents);
  try { fs.renameSync(temp, file); } catch (error) { fs.rmSync(temp, { force: true }); throw error; }
}

// Find TOML tables without treating headers inside multiline strings as real sections.
function tableKeys(text) {
  const tokens = text.match(/"(?:\\.|[^"\\])*"|'[^']*'|[A-Za-z0-9_-]+|\./g);
  if (!tokens) return null;
  const keys = [];
  for (let i = 0; i < tokens.length; i++) {
    if (i % 2 === 1) { if (tokens[i] !== ".") return null; continue; }
    const t = tokens[i];
    if (t === ".") return null;
    keys.push(t.startsWith('"') ? JSON.parse(t) : t.startsWith("'") ? t.slice(1, -1) : t);
  }
  return keys;
}
export function sections(text) {
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
  const tables = [];
  let multi = null, offset = 0;
  for (const line of lines) {
    if (!multi) {
      const match = line.match(/^\s*\[([^\[\]\r\n]+)\]\s*(?:#.*)?(?:\r?\n)?$/);
      const arrayMatch = line.match(/^\s*\[\[.*\]\]/);
      if (match || arrayMatch) tables.push({ start: offset, keys: match ? tableKeys(match[1]) : null });
    }
    let quote = null;
    for (let i = 0; i < line.length; i++) {
      const c = line[i], triple = line.slice(i, i + 3);
      if (multi) {
        if (multi === '"""' && c === "\\") { i++; continue; }
        if (triple === multi) { multi = null; i += 2; }
        continue;
      }
      if (quote) {
        if (quote === '"' && c === "\\") { i++; continue; }
        if (c === quote) quote = null;
        continue;
      }
      if (c === "#") break;
      if (triple === '"""' || triple === "'''") { multi = triple; i += 2; continue; }
      if (c === '"' || c === "'") quote = c;
    }
    offset += line.length;
  }
  return tables.map((t, i) => ({ ...t, end: tables[i + 1]?.start ?? text.length }));
}
export function extractConfig(text, keys = [serverKey, "revit-2026"]) {
  const selected = sections(text).filter(t => t.keys?.[0] === "mcp_servers" && keys.includes(t.keys[1]));
  const fragments = selected.map(t => text.slice(t.start, t.end));
  let rest = text;
  for (const t of [...selected].reverse()) rest = rest.slice(0, t.start) + rest.slice(t.end);
  return { rest, fragments };
}
export function configuration(nodePath, bridgePath) {
  const quoted = s => JSON.stringify(s.replaceAll("\\", "/"));
  return `[mcp_servers.${serverKey}]
command = ${quoted(nodePath)}
args = [${quoted(bridgePath)}]
startup_timeout_sec = 30
tool_timeout_sec = 180

[mcp_servers.${serverKey}.env]
REVIT_MCP_VERSION = "2026"
REVIT_MCP_PORT = "7891"
REVIT_MCP_TIMEOUT_MS = "120000"
`;
}
export function mergeConfig(text, fragment) {
  const { rest, fragments } = extractConfig(text);
  return { text: rest.trimEnd() + (rest.trim() ? "\n\n" : "") + fragment, fragments };
}
function xml(s) { return s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function manifest(assembly) {
  return `<?xml version="1.0" encoding="utf-8"?>
<RevitAddIns><AddIn Type="Application">
<Name>Hajtrak Revit MCP</Name>
<Assembly>${xml(assembly)}</Assembly>
<FullClassName>RevitMCPAddin.App</FullClassName>
<AddInId>${addinId}</AddInId>
<VendorId>Hajtrak</VendorId>
<VendorDescription>Hajtrak - Revit model review and modelling integration</VendorDescription>
</AddIn></RevitAddIns>
`;
}
export function verifyPayload(packageDir) {
  const manifestFile = path.join(packageDir, "payload-manifest.json");
  const data = JSON.parse(read(manifestFile));
  if (data.product !== "Hajtrak Revit MCP" || data.revit !== "2026" || data.toolCount !== 98)
    throw new Error("Unexpected installer payload.");
  for (const file of data.files) {
    const target = inside(packageDir, path.join(packageDir, file.path));
    if (!fs.existsSync(target) || digest(fs.readFileSync(target)) !== file.sha256)
      throw new Error("Payload verification failed: " + file.path);
  }
  for (const required of ["Node/node.exe", "McpServer/dist/index.js", "installer/engine/install.mjs",
    ...runtimeNames.map(n => "Addin/" + n)]) {
    if (!data.files.some(f => f.path === required)) throw new Error("Required payload file is absent: " + required);
  }
  return { ...data, packageHash: digest(fs.readFileSync(manifestFile)) };
}
function validateOptions(o) {
  for (const key of ["installDir", "addinDir", "configPath"]) if (!path.isAbsolute(o[key])) throw new Error(key + " must be absolute.");
  const roots = [o.installDir, o.addinDir].map(p => path.resolve(p));
  for (const root of roots) {
    if (root === path.parse(root).root) throw new Error("A filesystem root cannot be an installation directory.");
    if (fs.existsSync(root) && fs.lstatSync(root).isSymbolicLink()) throw new Error("Installation directory cannot be a symbolic link.");
  }
  if (roots[0] === roots[1] || roots.some(r => insideOrEqual(r, o.configPath))) throw new Error("Configuration must be separate from installed program files.");
}
function insideOrEqual(base, p) {
  const r = path.relative(base, path.resolve(p));
  return !r.startsWith(".." + path.sep) && r !== ".." && !path.isAbsolute(r);
}
export function install(o) {
  validateOptions(o);
  const payload = verifyPayload(o.packageDir);
  fs.mkdirSync(o.addinDir, { recursive: true });
  const activeManifest = path.join(o.addinDir, "RevitMCPAddin.addin");
  for (const name of fs.readdirSync(o.addinDir).filter(n => n.endsWith(".addin"))) {
    const file = path.join(o.addinDir, name);
    if (file !== activeManifest && read(file).toLowerCase().includes(addinId.toLowerCase()))
      throw new Error("A duplicate integration manifest exists: " + name + ". Resolve it before installing.");
  }
  const stateFile = path.join(o.installDir, "installation-state.json");
  const previous = fs.existsSync(stateFile) ? JSON.parse(read(stateFile)) : null;
  if (previous && (previous.addinDir !== o.addinDir || previous.configPath !== o.configPath))
    throw new Error("Existing installation uses different target paths.");
  fs.mkdirSync(o.installDir, { recursive: true });
  const versionDir = inside(o.installDir, path.join(o.installDir, "versions", payload.version + "-" + payload.packageHash.slice(0, 12)));
  if (!fs.existsSync(versionDir)) {
    fs.mkdirSync(path.dirname(versionDir), { recursive: true });
    const staged = versionDir + ".staging-" + crypto.randomUUID();
    fs.cpSync(o.packageDir, staged, { recursive: true });
    verifyPayload(staged);
    fs.renameSync(staged, versionDir);
  } else verifyPayload(versionDir);
  const backupDir = inside(o.installDir, path.join(o.installDir, "backups", new Date().toISOString().replaceAll(/[:.]/g, "-")));
  fs.mkdirSync(backupDir, { recursive: true });
  const originals = previous?.originals ?? {};
  const undo = [];
  function replace(file, bytes, recordOriginal = true) {
    const current = fs.existsSync(file) ? fs.readFileSync(file) : null;
    undo.push(() => current === null ? fs.rmSync(file, { force: true }) : atomicWrite(file, current));
    if (recordOriginal && !(file in originals)) {
      const backupFile = current === null ? null : path.join(backupDir, digest(Buffer.from(file)) + ".backup");
      if (backupFile) fs.writeFileSync(backupFile, current);
      originals[file] = backupFile;
    }
    atomicWrite(file, bytes);
  }
  try {
    const owned = [];
    for (const name of runtimeNames) {
      const file = path.join(o.addinDir, name), bytes = fs.readFileSync(path.join(versionDir, "Addin", name));
      replace(file, bytes); owned.push({ path: file, sha256: digest(bytes) });
    }
    const manifestBytes = Buffer.from(manifest(path.join(o.addinDir, "RevitMCPAddin.dll")));
    replace(activeManifest, manifestBytes); owned.push({ path: activeManifest, sha256: digest(manifestBytes) });
    let configOriginal = previous?.configOriginal ?? null;
    let appliedConfig = previous?.appliedConfig ?? null;
    let configChanged = false;
    if (o.configureCodex) {
      const current = read(o.configPath);
      appliedConfig = configuration(path.join(versionDir, "Node", "node.exe"), path.join(versionDir, "McpServer", "dist", "index.js"));
      const merged = mergeConfig(current, appliedConfig);
      if (!previous?.configOriginal) configOriginal = merged.fragments;
      replace(o.configPath, Buffer.from(merged.text), false);
      configChanged = true;
    } else if (previous?.appliedConfig) {
      throw new Error("A managed Codex configuration already exists. Keep configuration enabled when upgrading.");
    }
    const state = { product: payload.product, version: payload.version, addinDir: o.addinDir, configPath: o.configPath,
      versionDir, originals, owned, configOriginal, appliedConfig, configChanged: configChanged || previous?.configChanged || false };
    atomicWrite(stateFile, JSON.stringify(state, null, 2));
    return { ok: true, version: payload.version, versionDir, configuredCodex: !!o.configureCodex,
      message: "Installed. Restart Revit and the MCP connection. If disabled in Revit Add-Ins Manager, enable this integration there." };
  } catch (error) {
    for (const restore of undo.reverse()) { try { restore(); } catch { /* original backup remains available */ } }
    throw error;
  }
}
export function uninstall(o) {
  validateOptions(o);
  const stateFile = path.join(o.installDir, "installation-state.json");
  const state = JSON.parse(read(stateFile));
  if (state.product !== "Hajtrak Revit MCP" || state.addinDir !== o.addinDir || state.configPath !== o.configPath)
    throw new Error("Installation state does not match these target directories.");
  const versionDir = inside(path.join(o.installDir, "versions"), state.versionDir);
  if (fs.existsSync(versionDir) && fs.lstatSync(versionDir).isSymbolicLink()) throw new Error("Refusing to remove a linked version directory.");
  verifyPayload(versionDir);
  const permitted = new Set([...runtimeNames, "RevitMCPAddin.addin"].map(n => path.join(o.addinDir, n)));
  for (const file of state.owned) {
    if (!permitted.has(file.path)) throw new Error("Unexpected managed add-in file.");
    if (fs.existsSync(file.path) && digest(fs.readFileSync(file.path)) !== file.sha256)
      throw new Error("An installed file changed after setup. Resolve it before uninstalling: " + path.basename(file.path));
  }
  const currentConfig = read(o.configPath);
  const currentManaged = extractConfig(currentConfig, [serverKey]);
  if (state.configChanged && state.appliedConfig && currentManaged.fragments.join("").trim() !== state.appliedConfig.trim())
    throw new Error("The managed Codex entry changed after installation. Preserve/merge those settings before uninstalling.");
  if (state.configChanged && state.configOriginal?.length && extractConfig(currentManaged.rest, ["revit-2026"]).fragments.length)
    throw new Error("A new legacy Revit connector entry exists; merge it before restoring old settings.");
  for (const [file, backup] of Object.entries(state.originals)) {
    if (!permitted.has(file)) throw new Error("Unexpected backup target.");
    if (backup && (!insideOrEqual(path.join(o.installDir, "backups"), backup) || !fs.existsSync(backup)))
      throw new Error("Original file backup is unavailable.");
  }
  for (const file of state.owned) {
    const original = state.originals[file.path];
    if (original) atomicWrite(file.path, fs.readFileSync(original));
    else fs.rmSync(file.path, { force: true });
  }
  if (state.configChanged) {
    const old = state.configOriginal ?? [];
    const restored = currentManaged.rest.trimEnd() + (old.length ? "\n\n" + old.join("\n") : "") + "\n";
    atomicWrite(o.configPath, restored);
  }
  // Keep backups, journals and unknown files. Only remove the explicitly managed version directory.
  fs.renameSync(stateFile, inside(o.installDir, path.join(o.installDir, "backups", "uninstalled-" + Date.now() + ".json")));
  return { ok: true, cleanupVersionDir: versionDir, message: "Uninstalled. Previous add-in files and connector settings restored where present. Backups and journals retained." };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = Object.fromEntries(process.argv.slice(3).reduce((a, x, i, all) => {
      if (x.startsWith("--")) a.push([x.slice(2), all[i + 1]]); return a;
    }, []));
    const options = { installDir: args["install-dir"], addinDir: args["addin-dir"], configPath: args.config,
      packageDir: args.package, configureCodex: args["configure-codex"] === "true" };
    const result = process.argv[2] === "install" ? install(options) : process.argv[2] === "uninstall" ? uninstall(options) : (() => { throw new Error("Unknown installer command."); })();
    console.log(JSON.stringify(result));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}


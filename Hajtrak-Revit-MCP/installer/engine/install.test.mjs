import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { install, uninstall, extractConfig, mergeConfig, configuration, verifyPayload, serverKey } from "./install.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "Hajtrak-Installer-Test-"));
  const packageDir = path.join(root, "package");
  const files = ["Node/node.exe", "McpServer/dist/index.js", "installer/engine/install.mjs",
    "Addin/RevitMCPAddin.dll", "Addin/RevitMCP.Core.dll", "Addin/RevitMCPAddin.deps.json",
    "Addin/Microsoft.Web.WebView2.Core.dll", "Addin/Microsoft.Web.WebView2.Wpf.dll", "Addin/WebView2Loader.dll"];
  const rows = [];
  for (const name of files) {
    const target = path.join(packageDir, name);
    fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, "synthetic fixture: " + name);
    rows.push({ path: name, sha256: crypto.createHash("sha256").update(fs.readFileSync(target)).digest("hex") });
  }
  fs.writeFileSync(path.join(packageDir, "payload-manifest.json"), JSON.stringify({
    product: "Hajtrak Revit MCP", version: "0.9.0", revit: "2026", toolCount: 98, files: rows }));
  return { root, packageDir, installDir: path.join(root, "app"), addinDir: path.join(root, "addins"),
    configPath: path.join(root, "codex", "config.toml"), configureCodex: true };
}

test("clean-machine install needs no existing MCP or Codex configuration", () => {
  const o = fixture(); const result = install(o);
  assert.equal(result.ok, true);
  assert.match(fs.readFileSync(o.configPath, "utf8"), /mcp_servers.hajtrak-revit-2026/);
  assert.match(fs.readFileSync(path.join(o.addinDir, "RevitMCPAddin.addin"), "utf8"), /Hajtrak Revit MCP/);
  assert(fs.existsSync(path.join(result.versionDir, "Node", "node.exe")));
});
test("uninstall restores existing add-in and retains unrelated Codex settings", () => {
  const o = fixture(); fs.mkdirSync(o.addinDir, { recursive: true }); fs.mkdirSync(path.dirname(o.configPath), { recursive: true });
  fs.writeFileSync(path.join(o.addinDir, "RevitMCPAddin.dll"), "previous add-in");
  fs.writeFileSync(o.configPath, 'model = "example"\n\n[mcp_servers.revit-2026]\ncommand = "node"\nargs = ["old.js"]\n\n[mcp_servers.other]\nurl = "https://example.invalid/mcp"\n');
  install(o);
  fs.appendFileSync(o.configPath, '\n[projects.example]\ntrust_level = "trusted"\n');
  const removed = uninstall(o);
  assert.equal(removed.ok, true);
  assert.equal(fs.readFileSync(path.join(o.addinDir, "RevitMCPAddin.dll"), "utf8"), "previous add-in");
  const config = fs.readFileSync(o.configPath, "utf8");
  assert.match(config, /old.js/); assert.match(config, /projects.example/); assert.match(config, /mcp_servers.other/);
  assert(!config.includes("[mcp_servers." + serverKey + "]"));
  assert(fs.existsSync(path.join(o.installDir, "backups")));
});
test("optional Codex setup does not create or modify its configuration", () => {
  const o = fixture(); o.configureCodex = false; install(o);
  assert(!fs.existsSync(o.configPath));
  uninstall(o); assert(!fs.existsSync(o.configPath));
});
test("edited managed configuration blocks uninstall before add-in files change", () => {
  const o = fixture(); install(o);
  const dll = fs.readFileSync(path.join(o.addinDir, "RevitMCPAddin.dll"), "utf8");
  fs.appendFileSync(o.configPath, 'UNEXPECTED = "edited"\n');
  assert.throws(() => uninstall(o), /managed Codex entry changed/);
  assert.equal(fs.readFileSync(path.join(o.addinDir, "RevitMCPAddin.dll"), "utf8"), dll);
});
test("tampered payload is rejected before any target mutation", () => {
  const o = fixture(); fs.appendFileSync(path.join(o.packageDir, "Addin", "RevitMCPAddin.dll"), "tampered");
  assert.throws(() => install(o), /verification failed/); assert(!fs.existsSync(o.addinDir));
});
test("payload traversal is rejected", () => {
  const o = fixture(), p = path.join(o.packageDir, "payload-manifest.json");
  const data = JSON.parse(fs.readFileSync(p, "utf8")); data.files[0].path = "../outside";
  fs.writeFileSync(p, JSON.stringify(data)); assert.throws(() => verifyPayload(o.packageDir), /escapes/);
});
test("duplicate integration manifests are rejected", () => {
  const o = fixture(); fs.mkdirSync(o.addinDir, { recursive: true });
  fs.writeFileSync(path.join(o.addinDir, "Other.addin"), "9c4d2b7e-3f1a-4e5c-8b6d-1a2c3d4e5f60");
  assert.throws(() => install(o), /duplicate/);
});
test("repeat install preserves the first rollback originals", () => {
  const o = fixture(); fs.mkdirSync(path.dirname(o.configPath), { recursive: true });
  fs.writeFileSync(o.configPath, '[mcp_servers.revit-2026]\nargs = ["original.js"]\n');
  install(o); install(o); uninstall(o);
  assert.match(fs.readFileSync(o.configPath, "utf8"), /original.js/);
});
test("TOML headers inside multiline strings remain untouched", () => {
  const input = 'instructions = """\n[mcp_servers.revit-2026]\nnot a table\n"""\n\n[mcp_servers.other]\ncommand = "other"\n';
  const result = mergeConfig(input, configuration("C:/Runtime/node.exe", "C:/Bridge/index.js"));
  assert(result.text.startsWith(input.trimEnd())); assert.equal(result.fragments.length, 0);
});
test("quoted tables and their nested tool policies are handled together", () => {
  const input = '[mcp_servers."revit-2026"]\ncommand = "node"\n[mcp_servers."revit-2026".tools.ping]\napproval_mode = "approve"\n[unrelated]\nvalue = 1\n';
  const result = extractConfig(input);
  assert.equal(result.fragments.length, 2); assert.match(result.rest, /unrelated/); assert(!result.rest.includes("approval_mode"));
});
test("an existing unrelated legacy entry prevents destructive restoration", () => {
  const o = fixture(); fs.mkdirSync(path.dirname(o.configPath), { recursive: true });
  fs.writeFileSync(o.configPath, '[mcp_servers.revit-2026]\nargs = ["old.js"]\n');
  install(o); fs.appendFileSync(o.configPath, '\n[mcp_servers.revit-2026]\nargs = ["new.js"]\n');
  const before = fs.readFileSync(path.join(o.addinDir, "RevitMCPAddin.dll"), "utf8");
  assert.throws(() => uninstall(o), /new legacy/);
  assert.equal(fs.readFileSync(path.join(o.addinDir, "RevitMCPAddin.dll"), "utf8"), before);
});
test("arbitrary filesystem roots are rejected", () => {
  const o = fixture(); o.installDir = path.parse(o.installDir).root;
  assert.throws(() => install(o), /filesystem root/);
});

test("changed installed payload blocks uninstall before configuration or add-in changes", () => {
  const o = fixture(); const result = install(o);
  const before = fs.readFileSync(o.configPath, 'utf8');
  fs.appendFileSync(path.join(result.versionDir, 'Node', 'node.exe'), 'changed');
  assert.throws(() => uninstall(o), /verification failed/);
  assert.equal(fs.readFileSync(o.configPath, 'utf8'), before);
  assert(fs.existsSync(path.join(o.addinDir, 'RevitMCPAddin.addin')));
  assert(fs.existsSync(path.join(o.installDir, 'installation-state.json')));
});


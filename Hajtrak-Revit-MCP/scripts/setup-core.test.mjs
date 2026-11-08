import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { Setup, configParts } from "./setup-core.mjs";

function fixture() {
  const root = fs.mkdtempSync(path.join(process.env.REVIT_SETUP_TEST_ROOT ?? os.tmpdir(), "setup-test-"));
  const source = path.join(root, "source");
  const files = {
    "McpServer/dist/index.js": "bridge",
    "Addin/RevitMCPAddin.addin": '<RevitAddIns><AddIn><ClientId>9C4D2B7E-3F1A-4E5C-8B6D-1A2C3D4E5F60</ClientId><Assembly>RevitMCPAddin.dll</Assembly></AddIn></RevitAddIns>',
  };
  for (const name of ["RevitMCPAddin.dll", "RevitMCP.Core.dll", "RevitMCPAddin.deps.json", "Microsoft.Web.WebView2.Core.dll", "Microsoft.Web.WebView2.Wpf.dll", "runtimes/win-x64/native/WebView2Loader.dll"]) {
    files["Addin/Runtime/" + name] = name;
  }
  const manifest = { version: "0.9.0", toolCount: 98, files: [] };
  for (const [relative, contents] of Object.entries(files)) {
    const file = path.join(source, relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
    manifest.files.push({ path: relative, sha256: createHash("sha256").update(contents).digest("hex") });
  }
  fs.writeFileSync(path.join(source, "package-manifest.json"), JSON.stringify(manifest));
  const config = path.join(root, "config.toml");
  fs.writeFileSync(config, '[mcp_servers.other]\ncommand = "other"\n');
  const setup = new Setup({ root: path.join(root, "managed"), addins: path.join(root, "addins"), config });
  return { setup, source, config, root };
}

test("fresh install, update, rollback, uninstall and undo preserve unrelated config", () => {
  const { setup, source, config } = fixture();
  setup.install(source);
  const first = setup.state().package;
  assert.equal(setup.status().installed, true);
  fs.appendFileSync(config, '[mcp_servers.later]\ncommand = "later"\n');
  setup.install(source);
  assert.notEqual(setup.state().package, first);
  setup.rollback();
  assert.equal(setup.state().package, first);
  assert.match(fs.readFileSync(config, "utf8"), /mcp_servers.later/);
  setup.uninstall();
  assert.equal(fs.existsSync(path.join(setup.addins, "RevitMCPAddin.addin")), false);
  assert.equal(configParts(fs.readFileSync(config, "utf8")).selected.length, 0);
  assert.equal(fs.existsSync(path.join(setup.addins, "Microsoft.Web.WebView2.Core.dll")), true);
  setup.rollback();
  assert.equal(setup.status().installed, true);
  assert.deepEqual(setup.status().problems, []);
});

test("rollback refuses independent changes to owned files", () => {
  const { setup, source } = fixture();
  setup.install(source);
  fs.writeFileSync(path.join(setup.addins, "RevitMCPAddin.dll"), "changed");
  assert.throws(() => setup.rollback(), /changed/);
  assert.equal(fs.readFileSync(path.join(setup.addins, "RevitMCPAddin.dll"), "utf8"), "changed");
});

test("package tampering fails before live files are changed", () => {
  const { setup, source, config } = fixture();
  fs.writeFileSync(path.join(source, "McpServer/dist/index.js"), "changed");
  const before = fs.readFileSync(config, "utf8");
  assert.throws(() => setup.install(source), /verification failed/);
  assert.equal(fs.readFileSync(config, "utf8"), before);
  assert.equal(setup.state(), null);
});

test("an interrupted transaction recovers scoped settings and files", () => {
  const { setup, source, config } = fixture();
  setup.install(source);
  const before = setup.state();
  const file = path.join(setup.addins, "RevitMCPAddin.dll");
  const bytes = fs.readFileSync(file);
  const hash = createHash("sha256").update(bytes).digest("hex");
  fs.writeFileSync(setup.pending, JSON.stringify({
    files: [{ name: "RevitMCPAddin.dll", before: bytes.toString("base64"), beforeHash: hash, afterHash: null }],
    beforeTables: before.tables, afterTables: [], beforeState: fs.readFileSync(setup.record).toString("base64"),
  }));
  fs.unlinkSync(file);
  fs.appendFileSync(config, '[mcp_servers.later]\ncommand = "later"\n');
  setup.withLock(() => setup.recover());
  assert.equal(fs.existsSync(setup.pending), false);
  assert.deepEqual(fs.readFileSync(file), bytes);
  assert.match(fs.readFileSync(config, "utf8"), /mcp_servers.later/);
});

test("concurrent setup is rejected and document shutdown is enforced", () => {
  const { setup, source } = fixture();
  setup.withLock(() => assert.throws(() => setup.install(source), /Another setup/));
  setup.requireClosed = () => { throw new Error("Revit running"); };
  assert.throws(() => setup.install(source), /Revit running/);
  assert.equal(setup.state(), null);
});

test("adopts the previous installer and preserves environment and tool approval settings", () => {
  const { setup, source, config } = fixture();
  fs.mkdirSync(setup.addins, { recursive: true });
  fs.copyFileSync(path.join(source, "Addin/RevitMCPAddin.addin"), path.join(setup.addins, "RevitMCPAddin.addin"));
  fs.appendFileSync(config, '[mcp_servers.revit-2026]\ncommand = "node"\nargs = ["C:/RevitMCP.Custom/old/dist/index.js"]\nenv = { REVIT_MCP_PORT = "7891", REVIT_MCP_PROFILE = "core" }\n[mcp_servers.revit-2026.tools.revit_ping]\napproval_mode = "never"\n');
  setup.install(source);
  const text = fs.readFileSync(config, "utf8");
  assert.match(text, /REVIT_MCP_PROFILE = "core"/);
  assert.match(text, /approval_mode = "never"/);
  setup.rollback();
  assert.match(fs.readFileSync(config, "utf8"), /old\/dist\/index.js/);
});

test("uninstall rollback refuses newly added Revit configuration", () => {
  const { setup, source, config } = fixture();
  setup.install(source);
  setup.uninstall();
  fs.appendFileSync(config, '[mcp_servers.revit-2026]\ncommand = "replacement"\n');
  assert.throws(() => setup.rollback(), /changed/);
});

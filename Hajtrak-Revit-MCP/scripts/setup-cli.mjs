import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { Setup } from "./setup-core.mjs";

const action = process.argv[2] ?? "status";
const project = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const bundledPackage = path.join(project, "release", "revit-2026-multiple-sessions");
const packagePath = process.argv[3] || (fs.existsSync(bundledPackage)
  ? bundledPackage
  : path.join(project, "release", "custom-0.9.0"));
const addins = path.join(process.env.APPDATA, "Autodesk", "Revit", "Addins", "2026");
const config = path.join(process.env.USERPROFILE, ".codex", "config.toml");
const standaloneState = path.join(process.env.LOCALAPPDATA, "Hajtrak", "RevitMCP", "installation-state.json");
const setup = new Setup({
  root: path.join(process.env.LOCALAPPDATA, "RevitMCP.Custom", "managed-setup"),
  addins,
  config,
  progress: console.log,
  requireClosed() {
    const result = spawnSync("powershell.exe", ["-NoProfile", "-Command",
      "if (Get-Process -Name Revit -ErrorAction SilentlyContinue) { exit 2 }"], { encoding: "utf8", windowsHide: true });
    if (result.error || result.status === null || ![0, 2].includes(result.status)) throw new Error("Could not check whether Revit is running.");
    if (result.status === 2) throw new Error("Save your models and close Revit, then choose this operation again.");
  },
});

try {
  if (Number(process.versions.node.split(".")[0]) < 22) throw new Error("Node.js 22 or newer is required.");
  const standalone = fs.existsSync(standaloneState) ||
    (fs.existsSync(config) && /^\s*\[mcp_servers\.hajtrak-revit-2026(?:\.|\])/m.test(fs.readFileSync(config, "utf8")));
  if (standalone && ["install", "repair", "rollback", "uninstall"].includes(action)) {
    throw new Error("The standalone EXE owns this installation. Manage it through Windows Installed apps before using this setup.");
  }
  switch (action) {
    case "status":
      {
        const state = setup.status();
        if (standalone) {
          console.log("Standalone EXE installation detected. Manage it through Windows Installed apps.");
          break;
        }
        const legacy = fs.existsSync(path.join(addins, "RevitMCPAddin.addin"));
        console.log(state.installed ? "Revit MCP is installed and registered with this setup." :
          legacy ? "An existing Revit MCP installation was detected. Choose Install or update to register it with this setup." :
          "Revit MCP is not installed.");
        if (state.package) console.log("Package: " + state.package);
        console.log("Rollback available: " + (state.canRollback ? "Yes" : "No"));
        for (const issue of state.problems) console.log("Needs attention: " + issue);
        if (state.installed && !state.problems.length) console.log("Installed files and Codex settings match the installation record.");
      }
      break;
    case "install":
      setup.install(packagePath);
      console.log("Installation completed. Open Revit, then start a fresh Codex conversation and run revit_ping.");
      break;
    case "repair":
      setup.withLock(() => setup.recover());
      {
        let source = setup.state()?.package ?? packagePath;
        try { setup.validatePackage(source); }
        catch {
          console.log("The recorded package is unavailable or damaged. Verifying the bundled package for repair.");
          setup.validatePackage(packagePath);
          source = packagePath;
        }
        setup.install(source);
      }
      console.log("Repair completed. Open Revit and test from a fresh Codex conversation.");
      break;
    case "rollback":
      setup.rollback();
      console.log("Previous setup state restored. Start a fresh Codex conversation after opening Revit.");
      break;
    case "uninstall":
      setup.uninstall();
      console.log("Revit add-in and its Codex registration removed. Recovery packages, user settings, logs and shared WebView2 files are retained.");
      break;
    case "test": {
      const bridge = path.join(setup.state()?.package ?? packagePath, "McpServer", "dist", "revitClient.js");
      if (fs.existsSync(bridge)) {
        const { listRevitSessions } = await import(pathToFileURL(bridge).href);
        const sessions = listRevitSessions ? (await listRevitSessions()).data.sessions : [];
        if (sessions.length) {
          console.log("Authenticated Revit sessions:");
          for (const session of sessions) {
            const model = session.documentStatus === "unavailable"
              ? "active model unavailable" : session.activeDocumentTitle ?? "no active model";
            console.log(`  ${session.sessionId} | PID ${session.processId} | port ${session.port} | ${model}`);
          }
          console.log("In Codex, call revit_ping with listSessions: true and use the intended sessionId.");
          break;
        }
      }
      // Older installed add-ins only advertise the preferred port.
      const token = fs.readFileSync(path.join(addins, "revit-mcp-token.txt"), "utf8").trim();
      const response = await fetch("http://127.0.0.1:7891/mcp", {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(10000),
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ command: "ping", params: {} }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error("Connection test failed: " + (result.error?.code ?? response.status));
      console.log("Authenticated connection succeeded.");
      console.log("Active model: " + (result.data?.activeDocumentTitle ?? "No active model"));
      console.log("To verify the conversation connection, run revit_ping inside Codex too.");
      break;
    }
    default: throw new Error("Unknown setup action.");
  }
} catch (error) {
  console.error("Setup could not complete: " + error.message);
  process.exitCode = 1;
}

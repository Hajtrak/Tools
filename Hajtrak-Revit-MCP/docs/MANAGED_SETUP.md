# Revit MCP Setup

Double-click **Setup-RevitMCP.cmd** to open the menu. It works from any current directory and requires Node.js 22 or newer.

This setup supports **Revit 2026 with Codex on Windows** and manages a verified 0.9.0 package. In a source checkout, run the staging procedure in [Build and installation](BUILD_AND_INSTALL.md) first. If an EXE installation is present, use [Windows Installed apps](STANDALONE_INSTALLER.md).

| Option | Result |
| --- | --- |
| Status | Shows registration, file/configuration differences and rollback availability. |
| Install or update | Verifies the package, recognises the previous custom installation, creates a versioned package and registers the add-in and Codex entry. |
| Test connection | Performs an authenticated, read-only ping against the open Revit instance. Run revit_ping in Codex as well to test that conversation's connection. |
| Repair | Recovers an interrupted operation and reinstalls the recorded package. Uses the staged package if the recorded package is unavailable or damaged. |
| Roll back | Undoes the last setup operation while preserving unrelated Codex configuration. Refuses to overwrite independent changes to tracked files or Revit settings. |
| Uninstall | Removes the registered add-in files and the Revit 2026 Codex tables. Retains recovery packages, user settings, logs, token and shared WebView2 files. Rollback can undo it. |

Close Revit before install, repair, rollback or uninstall. Keep Revit open for the connection test.

After installation, open Revit and your model, then use a fresh Codex conversation. An older conversation may retain its prior connection. Setup cannot refresh a connection held by the Codex host.

The installation record is stored under %LOCALAPPDATA%/RevitMCP.Custom/managed-setup. Package copies and recovery records remain available after uninstall.

The first Install or update registers the current custom installation and creates its recovery snapshot. Run this before using the new Uninstall option. The older standalone scripts retain their earlier behaviour.

For scripted operation, run Setup-RevitMCP.ps1 -Action status, or choose install, test, repair, rollback, or uninstall. Scripted mutation commands run immediately. The interactive menu asks for confirmation.

Configuration edits support normal unquoted Codex table headers and single-line command argument arrays. Multiline TOML strings and unsupported Revit table syntax require a manual merge. Setup preserves the existing server environment and approval settings.

Interrupted operations are recovered by Repair. A lock belonging to a process that has exited is automatically released. An unreadable lock or independently changed recovery files require inspection before recovery.

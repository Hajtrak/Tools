# Revit MCP Setup

Double-click **Setup-RevitMCP.cmd** to open the menu. It works from any current directory and requires Node.js 22 or newer.

This setup supports **Revit 2026 with Codex on Windows** and manages a verified 0.9.0 package. In a source checkout, run the staging procedure in [Build and installation](BUILD_AND_INSTALL.md) first. The menu supports a clean install and can adopt the earlier custom PowerShell installation. If the standalone EXE is installed, uninstall it through [Windows Installed apps](STANDALONE_INSTALLER.md) before switching to the menu.

| Option | Result |
| --- | --- |
| Status | Shows registration, file/configuration differences and rollback availability. |
| Install or update | Verifies the package, recognises the previous custom installation, creates a versioned package and registers the add-in and Codex entry. |
| Test connection | Lists authenticated Revit sessions with their process IDs, ports and active models when available. For older add-ins it checks the preferred port. |
| Repair | Recovers an interrupted operation and reinstalls the recorded package. Uses the staged package if the recorded package is unavailable or damaged. |
| Roll back | Undoes the last setup operation while preserving unrelated Codex configuration. Refuses to overwrite independent changes to tracked files or Revit settings. |
| Uninstall | Removes the registered add-in files and the Revit 2026 Codex tables. Retains recovery packages, user settings, logs, token and shared WebView2 files. Rollback can undo it. |

The menu ships in the setup bundle and source tree. Downloading the standalone EXE gives you the backup installation method and its separate recovery record. To switch from the menu to the EXE, uninstall through the menu first. Both methods manage the same Revit add-in files.

Close Revit before install, repair, rollback or uninstall. Keep Revit open for the connection test.

After installation, open Revit and your model, then use a fresh Codex conversation. Run `revit_ping` with `listSessions: true` to discover sessions. Include the intended `sessionId` in calls when multiple sessions are open. An older conversation may retain its prior connection.

The installation record is stored under %LOCALAPPDATA%/RevitMCP.Custom/managed-setup. Package copies and recovery records remain available after uninstall.

The first Install or update registers the current custom installation and creates its recovery snapshot. Run this before using the new Uninstall option. The older standalone scripts retain their earlier behaviour.

For scripted operation, run Setup-RevitMCP.ps1 -Action status, or choose install, test, repair, rollback, or uninstall. Scripted mutation commands run immediately. The interactive menu asks for confirmation.

Configuration edits support normal unquoted Codex table headers and single-line command argument arrays. Multiline TOML strings and unsupported Revit table syntax require a manual merge. Setup preserves the existing server environment and approval settings.

Interrupted operations are recovered by Repair. A lock belonging to a process that has exited is automatically released. An unreadable lock or independently changed recovery files require inspection before recovery.

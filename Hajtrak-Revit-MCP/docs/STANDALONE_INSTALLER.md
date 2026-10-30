# Standalone installer — Revit 2026

Download `Hajtrak-Revit-MCP-0.9.0-Revit2026-Windows-x64-Setup.exe` and its SHA256 file from [GitHub Releases](https://github.com/Hajtrak/Tools/releases). This is an unsigned development preview; full live modelling acceptance remains pending.

## Install on another computer

1. Use Windows x64 with a licensed Autodesk Revit 2026 installation. Install Codex separately if you want the automatic connector setup.
2. Close Revit. Run the setup executable as the Windows user who will use Revit and Codex. Administrator rights are not requested.
3. Confirm the Revit 2026 folder. Leave **Configure Codex for this Windows user** selected for automatic configuration, then select **Install**.
4. Start Revit and allow the Hajtrak add-in when prompted. If Revit remembers this add-in as disabled, enable it in Add-Ins Manager if your organisation permits it. Restart Codex to load the connector.
5. Test with a disposable model before using production work.

No previous MCP, Node.js, npm, .NET SDK, or source checkout is needed. Setup contains the complete Hajtrak bridge, all production Node modules, portable Node 22, the Revit add-in and a self-contained setup runtime. Once downloaded, installation requires no package downloads. Revit itself is required and is not included. The optional AutoAudit web application is separate and is not needed for MCP tools.

The connection between the bridge and Revit uses authenticated local loopback HTTP on port 7891. AI-client processing remains subject to the client's own data policies.

## What setup changes

- App files: `%LOCALAPPDATA%/Hajtrak/RevitMCP`, with versioned payloads and local backups.
- Add-in: the current user's `%APPDATA%/Autodesk/Revit/Addins/2026`, with runtime DLLs beside the manifest.
- Optional Codex configuration: `%USERPROFILE%/.codex/config.toml`, connector `hajtrak-revit-2026`.
- Windows Installed apps: a per-user uninstall entry.

The original `revit-2026` connector entry is replaced when present, so the standard migration results in one configured Revit MCP. Other connector settings are preserved. A second add-in manifest with the same add-in ID blocks installation rather than creating duplicate loads. Custom connector names require manual review to avoid duplicates.

## Uninstall and rollback

Close Revit, then uninstall **Hajtrak Revit MCP** through Windows Installed apps. Previous affected add-in files and connector entries are restored where available. Unrelated connector settings, backups and operation journals are preserved. If managed files/settings have changed since setup, uninstall stops for review instead of overwriting those edits. Retain the local backups for recovery.

## Build the installer

Build prerequisites are .NET 8 SDK, Node/npm and the normal source dependencies. Download an official Windows x64 Node 22 ZIP, verify it against Node's published `SHASUMS256.txt`, and extract it. Supply a provenance JSON with `version`, `source`, `archive`, and `sha256` fields (public values only).

```powershell
./scripts/Build-StandaloneInstaller.ps1 -NodeRuntimeDirectory <extracted-node-directory> -NodeProvenanceFile <provenance.json>
```

The build runs bridge and installer tests, builds without deploying to Revit, gathers production dependencies and licence notices, hashes the payload, verifies discovery of all 98 tools, and produces the EXE and SHA256 file under an isolated `release/standalone-*` directory. The destination machine does not need those build prerequisites.

For a non-installing check of a built executable:

```powershell
./Hajtrak-Revit-MCP-0.9.0-Revit2026-Windows-x64-Setup.exe --verify-package --report <local-report.json>
```

This checks embedded hashes and starts the bundled bridge to discover tool schemas; it does not install, configure Codex, or perform Revit model operations.

## Licences

The original MIT licence and Le Phu copyright remain included. The fork originates from KenLP/RevitMCPServer v0.8.40. Node's bundled licence includes its third-party notices; WebView2 and .NET runtime notices are included under `Licenses`. Production npm packages retain their distributed notices. See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

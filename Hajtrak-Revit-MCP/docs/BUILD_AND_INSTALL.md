# Build, installation and rollback

Run commands from the Hajtrak-Revit-MCP directory. Revit 2026 is the current custom development target.

For a fresh computer, use the [standalone EXE installer](STANDALONE_INSTALLER.md). It includes Node and bridge dependencies and requires no original MCP installation. The source staging/migration helpers below remain available for development.

## Build

Install .NET 8 SDK and Node.js 22 or later. Restore dependencies, then build without deploying:

```powershell
dotnet restore src/RevitAddin.Tests/RevitMCPAddin.Tests.csproj
dotnet build src/RevitAddin/RevitMCPAddin.csproj -c Release -p:DeployToRevit=false
npm ci --prefix src/McpServer
npm run build --prefix src/McpServer
```

Development builds default to deployment disabled. Explicitly retain this setting when testing.

## Tests

```powershell
dotnet test src/RevitAddin.Tests/RevitMCPAddin.Tests.csproj -p:DeployToRevit=false
npm test --prefix src/McpServer
node src/McpServer/scripts/check-tools.mjs
node scripts/check-version.mjs
```

The MCP discovery check does not modify a model. Live API acceptance must use a disposable local model copy.

## Stage a development package

After restoring/building dependencies:

```powershell
./scripts/Stage-CustomBuild.ps1
```

The script creates a new versioned directory under release, refuses to overwrite an existing package, includes runtime dependencies and creates a SHA256 file manifest. It performs no installation.

## Existing-connector replacement

`Install-CustomBuild.ps1` is the older replacement/migration helper. It expects an existing revit-2026 entry in the user's Codex configuration and an existing RevitMCPAddin.addin manifest. Use the standalone EXE for a clean installation.

Close Revit and preview the replacement:

```powershell
./scripts/Install-CustomBuild.ps1 -PackagePath "C:/Builds/Hajtrak-Revit-MCP"
```

Apply only after reviewing the preview:

```powershell
./scripts/Install-CustomBuild.ps1 -PackagePath "C:/Builds/Hajtrak-Revit-MCP" -Apply
```

The supplied path must be the staged package root containing package-manifest.json. Use an actual local package path in place of the example.

The installer validates hashes, preserves prior configuration/runtime files and updates the existing connector rather than registering a second one. The DLLs are co-located with the add-in manifest in the user Revit add-in folder; the Node bridge is stored in its versioned application-data folder.

The add-in ID is preserved. Revit may retain its earlier enabled/disabled setting. If disabled, enable only this integration through Revit Add-Ins Manager and restart Revit. Administrator restrictions must not be bypassed.

Refresh/restart the MCP connection after bridge updates. Revit must restart after DLL or add-in manifest changes.

## Rollback

The installer prints a backup directory. Preview and apply restoration:

```powershell
./scripts/Restore-PreviousBuild.ps1 -BackupPath "C:/Backups/RevitMCP"
./scripts/Restore-PreviousBuild.ps1 -BackupPath "C:/Backups/RevitMCP" -Apply
```

Substitute the recorded backup directory. The helper refuses to overwrite configuration changed since installation. Preserve and merge newer settings deliberately in that case.

The generic deployment-layout repair helper requires an explicit installed package path; it does not contain a developer's local path.

## Live validation

Verify /health reports customProtocol pmk-1, version 0.9.0 and 95 registered C# commands. Confirm the intended disposable document before writes. Validate elevated/sloping placement, exact types, parameter failures, links, geometry, batch rollback, interrupted operation recovery and save state using the matrix in CUSTOM_BUILD.md.

Retain raw verification evidence outside Git. A responsive endpoint proves startup and connectivity, not full model correctness.

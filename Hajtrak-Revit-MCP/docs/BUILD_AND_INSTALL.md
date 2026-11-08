# Build, installation and rollback

Run commands from the Hajtrak-Revit-MCP directory. Revit 2026 is the current custom development target.

Use the [Revit MCP Setup menu](MANAGED_SETUP.md) with a verified package. The [standalone EXE](STANDALONE_INSTALLER.md) remains available as a backup with its own bundled runtime and uninstall entry.

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
node --test scripts/setup-core.test.mjs installer/engine/install.test.mjs
```

The MCP discovery check does not modify a model. Live API acceptance must use a disposable local model copy.

## Stage a development package

After restoring/building dependencies:

```powershell
./scripts/Stage-CustomBuild.ps1
```

The script creates a new versioned directory under release, refuses to overwrite an existing package, includes runtime dependencies and creates a SHA256 file manifest. It performs no installation.

## Install and maintain a source build

After staging the package, double-click Setup-RevitMCP.cmd and choose **Install or update**. The menu also provides status, connection testing, repair, rollback and uninstall. See [Revit MCP Setup](MANAGED_SETUP.md).

For a package in a different directory, pass its path to Setup-RevitMCP.ps1 using the PackagePath parameter. Keep standalone EXE installations under Windows Installed apps.

## Live validation

Verify /health reports customProtocol pmk-1, version 0.9.0 and 95 registered C# commands. Confirm the intended disposable document before writes. Validate elevated/sloping placement, exact types, parameter failures, links, geometry, batch rollback, interrupted operation recovery and save state using the matrix in CUSTOM_BUILD.md.

Retain raw verification evidence outside Git. A responsive endpoint proves startup and connectivity, not full model correctness.

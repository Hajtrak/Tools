# Hajtrak Revit MCP

A local Revit integration for model inspection, structural modelling and model-review workflows, exposed through Model Context Protocol (MCP).

**v0.9.0** — development preview. All 94 upstream tools are retained, with four additions: batch inspection, host structural snapshots, operation-status lookup and ordinary document save. The current catalogue contains **98 MCP tools**, backed by 95 C# commands (one hidden), two transport tools and two bridge workflow recipes.

## Origin and licence

This project is a modified distribution of **[KenLP/RevitMCPServer](https://github.com/KenLP/RevitMCPServer)**, based on **v0.8.40**, commit `4d273c6053be449e2066d0373d10b47c236de7ad`.

The original author/copyright holder is **Le Phu (KenLP)**. Original source and MIT copyright/permission notices are retained in [LICENSE](LICENSE). Hajtrak maintains this derivative and its changes; this is not an official upstream release and does not imply upstream endorsement.

See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for provenance and dependency references, and the [preserved upstream README](docs/UPSTREAM_README.md) for historical context.

## Architecture

```text
MCP client ──stdio──> Node.js bridge ──authenticated loopback HTTP──> Revit C# add-in
                                                                       │
                                                        ExternalEvent / transactions
                                                                       │
                                                                  Revit model
```

The bridge/add-in connection is restricted to the same computer. This restriction does not make an AI client's overall workflow offline: information returned to a client follows that client's processing and data policies.

## What changed

- Beam and column placement honours explicitly supplied elevations, uses unambiguous family/type selection and returns read-back evidence.
- Geometry inspection traverses nested geometry and distinguishes solid centroid from bounding-box midpoint.
- Linked bounding boxes use all eight transformed corners, with identity and pagination metadata.
- Parameter/type operations add validation, explicit angle units and protected-field handling.
- Writes can be bound to the intended document; dependency-event IDs are reported.
- Logical operation IDs and a local journal support recovery after interruption. Uncertain outcomes remain explicit and are not blindly replayed.
- Development builds do not automatically deploy to Revit.
- Personal metadata is opt-in on relevant queries.

Details for all 17 improved tools, compatibility changes and remaining limitations are in [CUSTOM_BUILD.md](docs/CUSTOM_BUILD.md).

## Requirements

The current development target is **Windows x64, Revit 2026, .NET 8 SDK and Node.js 22 or later**. Upstream multi-version source support is retained, but custom live validation for Revit 2025/2027 has not been established.

A licensed Revit installation is required for real model operations. Autodesk binaries, models, personal settings, credentials and project evidence are not distributed here.

## Build and check

Run from this project directory:

```powershell
npm ci --prefix src/McpServer
npm run build --prefix src/McpServer
npm test --prefix src/McpServer
node src/McpServer/scripts/check-tools.mjs

dotnet test src/RevitAddin.Tests/RevitMCPAddin.Tests.csproj -p:DeployToRevit=false
node scripts/check-version.mjs
```

The .NET projects use installed Revit API references where available and upstream compile-time reference packages otherwise. Some tests are pure policy tests; passing them does not establish live Revit geometry correctness.

See [BUILD_AND_INSTALL.md](docs/BUILD_AND_INSTALL.md) for staging, installation, backup and rollback.

## Validation status

The development baseline recorded **266 passing .NET tests**, **40 passing bridge tests**, a successful real MCP handshake for all 98 schemas and a successful Revit 2026 build. The local Revit health endpoint responded with version 0.9.0 and custom protocol `pmk-1`.

Full live placement, geometry, link, interruption and save acceptance remains pending. No whole-model speed claim or production-readiness guarantee is made.

## Optional AutoAudit pane

The inherited AutoAudit pane is a browser for a **separate application**, [KenLP/autoaudit-bim](https://github.com/KenLP/autoaudit-bim). Its default URL is local port 8601. If that application is not running, the pane displays a connection error; the MCP can still function. Installing this project does not install or configure that service.

## Documentation

- [Build, installation and rollback](docs/BUILD_AND_INSTALL.md)
- [Custom changes and live acceptance matrix](docs/CUSTOM_BUILD.md)
- [Privacy and publication boundary](docs/PRIVACY.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Command reference](docs/COMMANDS.md) — inherited descriptions plus custom additions in CUSTOM_BUILD.md
- [Development roadmap](docs/DEVELOPMENT_PLAN.md)
- [Changelog](CHANGELOG.md)

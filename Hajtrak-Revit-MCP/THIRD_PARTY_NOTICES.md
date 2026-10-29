# Third-party notices and provenance

## Revit MCP Server — upstream foundation

- Project: [KenLP/RevitMCPServer](https://github.com/KenLP/RevitMCPServer)
- Baseline tag: [v0.8.40](https://github.com/KenLP/RevitMCPServer/tree/v0.8.40)
- Baseline commit: [4d273c6053be449e2066d0373d10b47c236de7ad](https://github.com/KenLP/RevitMCPServer/commit/4d273c6053be449e2066d0373d10b47c236de7ad)
- Original copyright: **Copyright (c) 2026 Le Phu**
- Licence: **MIT**, preserved in this directory's [LICENSE](LICENSE).
- Historical upstream documentation: [UPSTREAM_README.md](docs/UPSTREAM_README.md).

This directory includes substantial upstream code and documentation, modified and redistributed by Hajtrak. Branding changes do not replace original copyright notices or imply endorsement by the original author.

Custom changes include structural placement corrections, expanded geometry/link inspection, bulk inspection/snapshot commands, ordinary save, operation recovery, verification and deployment changes. See CUSTOM_BUILD.md and CHANGELOG.md for scope and limitations.

## Dependencies

Dependencies are referenced through their package managers; their own licences and notices continue to apply. See package.json/package-lock.json and the .csproj files for pinned/resolved dependencies.

| Component | Source / notice |
|---|---|
| Model Context Protocol TypeScript SDK | [modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk), MIT |
| Zod | [colinhacks/zod](https://github.com/colinhacks/zod), MIT |
| Microsoft WebView2 SDK | [Microsoft WebView2 documentation](https://learn.microsoft.com/microsoft-edge/webview2/); follow the SDK package licence and redistribution terms |
| Autodesk Revit API | [Autodesk Revit developer resources](https://www.autodesk.com/developer-network/platform-technologies/revit); proprietary Autodesk software, not included as source or redistributed product binaries |
| Nice3point API reference packages | Referenced for compilation when installed Revit references are absent; see package licences and .csproj asset settings |
| TypeScript, Vitest and xUnit | Development/test dependencies; see each package's licence notices |

Packaged runtime dependencies must retain their included licence files. The optional AutoAudit application is separate, is not included here, and has its own [upstream repository](https://github.com/KenLP/autoaudit-bim).

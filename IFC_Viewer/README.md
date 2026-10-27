# IFC Viewer

Version **1.3.2** — offline Windows x64 IFC viewer. No login, uploads, subscription or runtime internet connection.

## Download and run

Download **[IFC Viewer 1.3.2](https://github.com/Hajtrak/Tools/releases/tag/ifc-viewer-v1.3.2)** from GitHub Releases.

- **Installer:** `IFC-Viewer-1.3.2-Setup.exe`. Installs for your Windows user with desktop and Start menu shortcuts, without administrator rights. Uninstall through Windows Settings.
- **Portable ZIP:** `IFC-Viewer-1.3.2-Windows-x64.zip`. Extract fully, then open `IFC Viewer/IFC Viewer.exe`. Keep all files together.
- `SHA256SUMS.txt` provides download checksums.

Builds are unsigned; Windows may display an unrecognised-publisher warning. IFC file associations are unchanged. Both versions contain the same offline viewer.

## Features

- Open/drop IFC files; rotate, pan, pointer-centred zoom, fit and preset views.
- Click members for configurable properties, exported lengths/weights and custom fields.
- Search, sort and group material lists; reorder columns; export TXT or CSV.
- Colour members individually/by group; hide/show members or groups.
- Show/hide storeys and gridlines; display grid names and filter to the base elevation.
- Orbit around selected members/groups and zoom to selection (Z).
- Process models locally and preserve source files.

[User guide](docs/USER_GUIDE.md) · [Verification](docs/VERIFICATION.md) · [Changelog](CHANGELOG.md) · [Release process](docs/RELEASING.md)

## Build and test

Use Node.js 22 or later and npm on Windows x64. Dependency installation and first-time installer tooling need internet access.

```bash
npm ci
npm test
npm run release
```

Downloads are created in `release/downloads/`. The portable runtime is in `release/IFC Viewer/`. WASM, workers and licence notices are bundled locally. `npm run package` builds just the portable folder; `npm start` launches the built app. If Electron installation was skipped, run `node node_modules/electron/install.js` first.

Optional geometry inspection: `npm run test:parser -- "path/to/model.ifc"`. Automated tests use synthetic fixtures and need no client files.

## Limits and data handling

One uncompressed IFC STEP file at a time. The 1 GB input guard is not a tested capacity claim. Large models and different exporters remain unverified. No measurements, editing or geometry-derived quantities. Missing quantities stay blank; supported units are converted when recognized. Hiding affects the view while exports/totals retain hidden members. Colours/visibility reset on replacement; field choices and column order are saved locally. No model contents are saved by those preferences.

[MIT licence](../LICENSE). Bundled components retain their own licences and notices.

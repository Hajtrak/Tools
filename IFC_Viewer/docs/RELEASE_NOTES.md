# IFC Viewer 1.2.1

Offline Windows x64 IFC viewer with member information and material lists.

## Downloads

- `IFC-Viewer-1.2.1-Setup.exe` — installs for your Windows user with desktop and Start menu shortcuts, without administrator rights.
- `IFC-Viewer-1.2.1-Windows-x64.zip` — extract fully, then run `IFC Viewer/IFC Viewer.exe`.
- `SHA256SUMS.txt` — SHA-256 checksums.

Unsigned builds may trigger Windows publisher warnings. No accounts, uploads, automatic updates or runtime internet connection. IFC associations are unchanged.

## Features

Rotate/pan/zoom and preset views; configurable member properties; searchable, sortable and grouped material lists; column reordering; TXT/CSV export; individual/group colours and hide/show. Version 1.2.1 improves selection/display efficiency and handles missing metadata safely.

## Validation and limits

Automated tests and TypeScript/build checks pass. A private 227,362-byte IFC retains 38 geometry objects and original quantities. Previous 1.2.0 desktop interactions were tested. The 1.2.1 desktop launch, installer install/uninstall and large-model rendering have not been reverified. Quantities depend on exported IFC properties; the app does not estimate steel quantities from geometry.

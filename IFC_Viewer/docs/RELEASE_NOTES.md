# IFC Viewer 1.3.1

Offline Windows x64 IFC viewer with member information and material lists.

## Downloads

- `IFC-Viewer-1.3.1-Setup.exe` — installs for your Windows user with desktop and Start menu shortcuts.
- `IFC-Viewer-1.3.1-Windows-x64.zip` — extract fully, then run `IFC Viewer/IFC Viewer.exe`.
- `SHA256SUMS.txt` — SHA-256 checksums.

## New in 1.3.1

- Show or hide IFC storeys and gridlines independently.
- Show gridline names at both ends of each named axis; labels stay upright while rotating.
- Base level only is enabled by default, hiding grid copies at upper elevations without hiding structural members. Clear it to show all grid elevations.
- Orbit around the combined centre of selected members or material-list groups.
- Zoom to selection with the toolbar button or Z. Fit model (F) still frames the whole model.

Existing material lists, grouping, member colours, visibility controls and CSV/TXT exports remain available. All model processing stays local; source IFC files are unchanged.

## Validation and limits

Material-data, display-state and new grid-visibility tests pass, along with TypeScript and production build checks. Grid tests cover multiple elevations within one grid, transformed placements, elevation tolerance, labels and visibility restoration. The portable app was rebuilt. Installer installation/uninstallation, large models and varied IFC exporters have not been reverified. Base means the lowest exported horizontal grid elevation, with 10 mm tolerance; it does not depend on storey names. Gridlines and names must be present in the IFC export.

Builds are unsigned. No accounts, uploads, automatic updates or runtime internet connection. Quantities depend on exported IFC properties.

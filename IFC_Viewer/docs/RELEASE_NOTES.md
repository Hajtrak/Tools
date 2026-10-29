# IFC Viewer 1.4.0

- Discover custom IFC property and quantity names automatically; choose and reorder any available columns without a default grouping.
- Edit scalar properties and simple quantities, add custom Comments, Notes and Work Group fields, and apply bulk edits.
- Search the property selector by property or property-set name.
- Save changes to a new IFC while preserving the original, element identifiers and geometry.
- See v1.4.0 beside the app name and in the window title.

## Downloads

- IFC-Viewer-1.4.0-Setup.exe: Windows x64 installer.
- IFC-Viewer-1.4.0-Windows-x64.zip: portable app; extract the entire folder.
- SHA256SUMS.txt: download checksums.

## Validation and limits

Regression tests, TypeScript/build checks and synthetic IFC2X3/IFC4 round trips cover custom names, shared-property isolation, type overrides, bulk editing, Unicode, identifier and geometry preservation. Desktop editing/save integration and property search checks passed during development. Structured properties are visible but read-only; multi-set relationship editing, IFC4x3 and large production models remain unverified or unsupported. See docs/PROPERTY_EDITING.md for details. Installer installation/uninstallation has not been verified. Builds are unsigned.

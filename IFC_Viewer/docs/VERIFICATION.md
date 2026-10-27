# Verification — IFC Viewer 1.0

Build and TypeScript checks passed.

The Windows x64 package was launched through Windows app controls and used to open a private local IFC fixture locally. The source file was not modified or uploaded. File size: 227,362 bytes (222 KiB). The app reported approximately 0.5–0.6 seconds to import on this computer.

An independent web-ifc parser check found 38 geometry objects: 22 beams (including angles/spacers exported as beams), 8 columns and 8 slabs representing padstones; 2,396 triangles. Source colours are red/pink steel and grey concrete. The displayed frame, angles, spacer links and padstones were inspected against the earlier model view.

Checked in the desktop UI: launch, local file picker, paths containing spaces, IFC import, rotate, wheel zoom, fit shortcut, preset view controls, cancellation, malformed IFC error message and preservation of the displayed model after a validation failure. A fit-to-box axis-snapping issue was corrected, and the resulting true isometric view was checked in the portable package. The final change repairs text encoding in status labels.

All app HTTP/HTTPS outbound requests are blocked; WASM and workers are local. Successful model import therefore did not rely on internet access. The operating system network adapter was not disabled.

Right/middle pan and drag-and-drop are implemented; their physical mouse gestures were not exercised by the available automated controls. Replacement cleanup is implemented but repeated-load memory performance has not been measured. Large-file performance, other IFC exporters and other Windows machines remain unverified. The 1 GB guard is not a tested capacity claim.

## Version 1.1 — member information and material list

TypeScript and production packaging passed. Tested again with the same 227,362-byte local a private local IFC fixture. No source changes or uploads.

- Data extraction: all 38 geometry objects included, including four CHS spacers and four angles; 30 steel members have exported length and mass. Combined length 91.203 m (screen rounding), exact steel mass 2606.094187291085 kg. Eight padstones have no exported member length/mass; these remain blank.
- Checked B3 properties against IFC data: section UB254x102x28, length 5.0251 m, exact weight 142.38057723313472 kg, works HR_Main, description Beam, reference B3. Both inherited type properties and occurrence properties are exposed without following inverse links to other members or owner history.
- Windows UI: selected B3 from the list and W7 by clicking the 3D column. Correct member information and gold highlight appeared. Group-by checklist successfully grouped by section into 10 rows, retaining all 38 objects. Property field choices include standard fields and source property-set names.
- Windows save dialogs successfully wrote both CSV and tab-separated TXT to local test files with spaces in their names. Both files were parsed and matched exactly: 10 groups, quantities total 38, unrounded weight total preserved.
- Automated checks passed for MET field extraction, inherited and occurrence properties, unit conversion (metres/millimetres), unsupported explicit units staying unknown, raw values preserved, numeric sorting with missing values, filtering, grouping, partial group quantities and CSV quoting/formula escaping.
- Field and group preferences persist locally; no IFC model contents are persisted by this feature. Outbound requests remain blocked and all assets remain bundled.

This update has been tested with one IFC exporter and this small file. Larger material lists and models from other exporters remain unverified. Only scalar exported properties and supported property/quantity relationships are indexed. Standard units depend on recognized IFC unit definitions; arbitrary field names can be displayed/grouped/exported through the source-field checklist but are not automatically interpreted as metres or kilograms. No geometry-based length/weight estimation is performed.

## Version 1.2 — colours, visibility and column order

Build, TypeScript, material-data regression checks and new display-state tests passed. Tested in the portable Windows app using the same 227,362-byte IFC with 38 objects.

Desktop checks passed for automatic colours on the 10 section groups; hiding a three-member group and restoring it using Show all with its colours preserved; selecting W7 in 3D and overriding only that column to pink within the group palette; hiding W7 individually and retaining all takeoff quantities; moving Section size with the Columns arrows; retaining the order after restarting; dragging Section size ahead of Member reference; and sorting by numeric Weight after dragging. Reopening resets colours and hidden members, as intended.

Automated tests cover colour batches and overrides, selection colours not replacing custom colours, hidden selection cleanup, Show all preserving colours, colour reset, model-state reset, movement in both directions, missing/removed fields, grouping fields in column order, unchanged quantities when hiding, and export header order. Display controls do not edit source IFCs or change takeoff totals. Colours and visibility are session-only; column ordering persists locally.

The palette repeats after 12 groups. Large-model performance of repeated colouring/visibility updates remains unverified. The sample model and other-exporter limits from version 1.1 still apply.

The final Windows CSV save test also passed: reordered headers begin Quantity, Section size, Member reference; all 10 groups and 38 objects are present, weight sorting is retained, exact combined weight is unchanged, and Display controls are excluded from the export.


## Version 1.2.1 � code review and targeted optimisation

TypeScript, production build, portable packaging and all material/display regression tests passed. The private 227,362-byte IFC was parsed locally again: 38 geometry objects, 30 lengths and masses, and unchanged combined steel mass of 2606.094187291085 kg. No IFC was uploaded.

Added regression coverage for missing member metadata, formula-safe export headers, incremental colour/visibility changes and a 10,000-member colour group. Selecting one additional member in that synthetic state sends one highlight change instead of recolouring all 10,000 members. Selection preserves material table rows; grouping and sorting are cached until their inputs change. This is an operation-count improvement, not a measured large-model rendering benchmark.

The rebuilt executable is in `release/IFC Viewer/IFC Viewer.exe`. An automated packaged desktop integration test was prepared in the ignored local test directory, but the test process could not launch the executable in this session. Consequently, desktop interaction and visual rendering of this patch have not been reverified. Earlier desktop results above apply to version 1.2.0. Full large-model GPU/memory profiling remains unverified.

Existing build warnings concern the libraries' optional WebGPU imports and the large bundled JavaScript asset. The viewer still uses WebGL; dependencies were not upgraded during this review.

## Distribution packaging

The installer configuration targets Windows x64, current-user installation and shortcuts. Source/build tests pass. The local portable ZIP was produced and archive-tested. Initial automated NSIS compilation was blocked. The complete release build subsequently succeeded in a normal Git Bash session on 24 October 2026. The installer is 117,130,149 bytes and the portable ZIP is 155,861,612 bytes. Both SHA-256 checksums were independently verified; the installer identifies as IFC Viewer 1.2.1. The tag-triggered GitHub workflow builds both release assets on Windows. Installation and uninstallation remain unverified. Private model fixtures and local diagnostics are excluded from the commit.

## Version 1.3.0 — 27 October 2026

Material-data, display-state and grid-visibility automated tests pass. TypeScript and production build checks pass; the portable Windows app was rebuilt. Grid filtering tests cover mixed elevations within one grid, transformed placements, 10 mm tolerance, label exclusion, restoring all axes and preserving the overall visibility toggle. The user confirmed the navigation and gridline updates during this session. Base-level filtering has automated coverage; installer installation/uninstallation, large-model rendering and varied IFC exporters remain unverified.

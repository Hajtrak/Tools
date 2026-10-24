# IFC Viewer 1.2.1

A local Windows x64 IFC viewer. No login, subscription, uploads or internet connection required.

## Start

Download [IFC Viewer 1.2.1 from GitHub Releases](https://github.com/Hajtrak/Tools/releases/tag/ifc-viewer-v1.2.1).

**Installer:** run `IFC-Viewer-1.2.1-Setup.exe`. It installs for your Windows user and adds desktop and Start menu shortcuts. Open using either shortcut. Uninstall through Windows Settings → Apps. No administrator rights required.

**Portable ZIP:** extract `IFC-Viewer-1.2.1-Windows-x64.zip` fully, then open `IFC Viewer/IFC Viewer.exe`. Keep all files together. Move the entire folder if needed.

Unsigned builds may show a Windows publisher warning. No automatic updates or IFC file-association changes. To update, run the newer installer or extract a newer ZIP into a separate folder.
## Controls

- Open IFC or Ctrl+O: choose a local .ifc file.
- Drop a single .ifc file onto the window to open it.
- Left drag: rotate.
- Right or middle drag: pan.
- Mouse wheel: zoom towards the pointer.
- Fit model or F: fit the current model in the window.
- Isometric / Front / Side / Top: preset directions.
- Escape: dismiss an error.

Opening another model replaces the previous model. Original IFC files are never changed. The app preserves source colours and centres the model for navigation; it is a viewer, not a survey-coordinate or measurement tool.

## Privacy and offline use

All IFC parsing happens locally. Parser, rendering libraries, WASM and workers are bundled. Outbound internet requests are blocked by the app. There are no accounts, cloud storage, telemetry or automatic updates. Electron may store ordinary window/rendering caches in your Windows app-data folder; the app does not save copies of your IFCs.

## First-version limits

One model at a time; uncompressed IFC STEP (.ifc) files only, up to 1 GB. The limit is a guard, not a claim that 1 GB models were performance-tested. IFCZIP, XML, editing, measurements are not included. Large models may take time and memory to import.


## Member information

Click a member in 3D or a row in the material list. The selected member turns gold. Click empty space or close the member panel to clear the selection. Dragging continues to rotate the model.

Use Choose fields in the member panel to tick the information you want to see. Standard fields include length in metres, weight in kilograms, section size, member reference, IFC name, IFC type, GlobalId, and your 1.01 MET Works / 1.02 MET Description. All supported exported scalar properties are also listed under their original property-set and property names, so models with different naming systems can be inspected.

Standard length prefers the exported Length quantity, then NetLength, Cut Length or System Length. Standard weight prefers Exact Weight, then NetWeight, Weight or GrossWeight. The source property is shown underneath the selected value. These are exported quantities, not measurements or estimates from geometry. No weight is calculated from a section or density. Missing values appear as a dash. Raw properties retain the original IFC units; standard length/weight are converted only when their units can be identified.

## Material list

The list opens below the model after loading. Use Material list to hide/show it, or drag its top divider to resize it.

- Columns: tick the fields to include. Quantity always appears.
- Click a column heading to sort; click again to reverse the order.
- Search: filter members using any of their available fields.
- Group by: tick one or more fields, such as section, works and description. Untick all to return to individual members. Grouping fields are included automatically in the list and export.
- A grouped row shows quantity and combined length/weight. Other values that differ show (varies). If length or weight itself is a grouping field, its value identifies the group rather than showing a sum. Exact underlying values define groups, so tiny length differences can create separate groups.
- Click a grouped row to highlight all its members.
- Export CSV / Export TXT: choose a local destination. Exports include all matching rows, current grouping, sort and chosen columns, including rows beyond the first 500 shown. CSV uses comma-separated quoted fields and UTF-8; TXT uses tabs. Numeric exports keep full precision, while the screen rounds to three decimal places. Cancel leaves the model and list unchanged.

Totals state how many members have usable length/weight. Missing values are excluded from overall totals; a group with incomplete length/weight data leaves that group total blank. Field choices and grouping are remembered on this computer; model contents are not saved.

## Colours, hiding and column order (1.2)

- Each material-list row has Colour and Hide/Show buttons. A grouped row applies the action to every member in that group. Buttons stay at the left when scrolling sideways.
- Click Colour to choose a palette colour or a custom colour. Restore original colour removes the override for those members. Colour groups assigns a palette to the currently listed groups; the 12-colour palette repeats for additional groups. Applying a new group palette overwrites previous colours for the matching members.
- Select an individual member in 3D and use Colour in the member panel to override that member alone. Chosen colours stay visible when selecting other members or changing the grouping. A coloured member keeps its chosen colour when selected; uncoloured selections use gold. A split swatch in a group row indicates mixed colours.
- Reset colours restores source colours throughout the model. Hidden members stay hidden until shown.
- Hide/Show works on an individual member or group. You can also use Hide selected in the member panel. Show all restores every hidden member without losing colours. Hidden rows remain in the list, shown in grey, and can still be selected for information. For a partly hidden group, Hide hides the entire group; Show appears once the whole group is hidden. To restore only one hidden member from a group, clear grouping or select that member in the individual list and use Show selected.
- Hiding and colouring affect the 3D view only. List totals and CSV/TXT exports still include hidden members. Use search to limit the rows being exported.
- Reorder columns by dragging a heading onto another heading, or open Columns and use the up/down arrows in the Column order section. Up means left; down means right. The Display action column stays at the left and is not exported. Other columns, including Quantity and grouping fields, can be moved. Column order is remembered on this computer and used in CSV/TXT exports.

Colours and hidden members apply only to the currently open model. Opening another IFC or restarting resets them, and does not modify the original IFC.

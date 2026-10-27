# Changelog

## 1.3.1 — 2026-10-27

- Show/hide IFC storeys and gridlines independently.
- Display grid axis names at both ends, with a separate name toggle.
- Show only the lowest horizontal grid elevation by default; restore all elevations with Base level only.
- Orbit around selected members or groups; zoom to selection using Z.
- Add grid visibility regression tests covering mixed elevations and transformed placements.

## 1.2.1 � 2026-10-24

- Apply colour and visibility changes only to affected members.
- Preserve material table DOM during selection and cache grouped/sorted rows.
- Reuse natural-sort collator and avoid redundant IFC byte copies.
- Reject stale asynchronous picks; prevent duplicate open dialogs.
- Keep geometry rows when metadata is missing; protect exported field headers from spreadsheet formulas.
- Validate all bounding-box coordinates and clean generated packaging staging.

## 1.2.0 — 2026-10-24

- Individual and group colours, automatic group palette, custom colours and restoration.
- Hide/show members or groups and Show all, preserving takeoff totals.
- Reorder columns by dragging headings or using arrows; preserve order in exports.

## 1.1.0 — 2026-10-24

- Member selection and configurable information fields.
- Material list with filtering, sorting, grouping, totals and CSV/TXT export.

## 1.0.0 — 2026-10-24

- Portable offline Windows IFC viewer with local parser assets.
- Open/drop files, rotate/pan/zoom, fit and preset views.

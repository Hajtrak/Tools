# IFC Material List Tool

Version 1.0.1 · 20 October 2026

## Use it next time

1. Save `IFC_Material_List_Tool.html` somewhere convenient. It is a complete, self-contained tool; the other files are not required to run it.
2. Open the HTML file in **Microsoft Edge or Google Chrome**. You can use **Open with** if double-clicking opens an editor.
3. Click **Choose IFC file**, or drag an `.ifc` file onto the drop area.
4. Review the piece count, exclusions, missing-data warning and preview.
5. Click **Save material list CSV**. The filename uses your IFC's name, followed by `_Material_List.csv`. Your browser saves it to its download location or asks where to save it, depending on your settings.
6. Optionally save the **extraction report**. If any member data is missing or invalid, a **Save missing-data CSV** button also appears.

No Revit, Python, installation or internet connection is needed. IFC files are processed locally in the browser and are not uploaded. You can move or copy the HTML tool to another computer.

## CSV format

```text
Name,Section Size,Length (mm),Piece Count
```

Rows group the same **IFC Name + section size + exact source length**. Different names remain on separate rows. Lengths retain source precision, converted to millimetres; no rounding to whole millimetres or stock lengths is applied. The CSV is UTF-8 with a BOM for Excel compatibility.

Names such as `TIE`, `COLUMN` and `HIP-RAFTER` are preserved. An explicit IFC name of `Unnamed` is preserved. Blank names are replaced with `Unnamed` and counted in the report. Labels that could be interpreted as spreadsheet formulas are prefixed with an apostrophe when exported.

## Scope and settings

- Reads text STEP `.ifc` files with IFCBEAM, IFCCOLUMN, IFCMEMBER and their standard-case variants. Supports member/property data used in IFC2X3 and IFC4. Extract compressed IFCZIP files before selecting them.
- Includes purlins, rails, ties, stays, wire ropes and slanted members when their section and length data are present. Native Revit family availability and placement restrictions do not affect this schedule.
- By default, excludes cleats, endplates, plates, clamp plates, baseplates, haunches, thermal breaks and sheets using their IFC Name.
- Clear **Exclude cleats, endplates and other named connection/plate pieces** to include those named objects when they belong to a supported member class. Changing the setting after selecting a file reruns the extraction.
- IFCPLATE, fasteners and other unsupported IFC classes remain outside the schedule, including when the exclusion checkbox is cleared.

## Data used and missing items

Section lookup uses a Revit-style `Family:Type` name first, then IFC ObjectType, Description and associated type name. This works with the supplied Tekla export. Check unusual exporters where those fields contain generic text instead of actual section sizes.

Lengths are read from IFC property sets or IFC length quantities. The priority is **Length**, then **NetLength**, then **GrossLength**. Project units and explicit per-property units are converted to millimetres. Equivalent numeric forms such as `100.0` and `1.E2` are treated as the same length. Conflicting values at the same priority are reported rather than guessed.

Objects with missing sections, missing IDs, missing/nonpositive/conflicting lengths or duplicate GlobalIds are reported and not counted. Every occurrence of a duplicate member GlobalId is rejected, independent of record order; whitespace-only IDs are treated as missing. The extraction report reconciles supported candidates into included pieces, named exclusions and missing/invalid records. Unsupported classes are outside this candidate count.

This tool **does not recover lengths from geometry**. An IFC without length properties or quantities will produce a missing-data report. It is a model material schedule, with no cutting, waste, fabrication or procurement allowances.

## Original v1.0 validation (reported in the supplied documentation)

The tool's extraction engine was checked against the original project IFC (not included):

| Check | Result |
|---|---:|
| Parsed entities | 444,316 |
| Beam/column/member candidates | 7,903 |
| Included pieces | 4,318 |
| Named CSV rows | 663 |
| Distinct sections | 73 |
| Named connection/plate exclusions | 3,585 |
| Missing/invalid member records | 0 |

All 663 rows and 4,318 pieces match the approved named CSV exactly after accounting for row order and equivalent decimal formatting. Thirteen extraction checks passed for quoting, names, grouping, exclusions, SI/conversion units, explicit property units, quantity lengths, missing/conflicting lengths, duplicate IDs, decimal precision, section fallback, Unicode, spreadsheet-safe CSV and incomplete files. Both interface and worker scripts passed syntax checks.

These checks exercised the extraction engine outside the browser. Automated Edge interface rendering could not run in this session; the file chooser/download workflow has not been independently exercised in a live browser.


## Reviewed release 1.0.1

Review on 20 October 2026 corrected duplicate/blank GlobalId handling, preserved exact source names, and reduced file-reading memory copies. All 15 extraction checks and local-file Edge browser checks passed. See [review and current validation limits](https://github.com/Hajtrak/Tools/blob/main/IFC_MaterialList/REVIEW.md) and [changelog](https://github.com/Hajtrak/Tools/blob/main/IFC_MaterialList/CHANGELOG.md). The earlier project-file validation above is historical and was not repeated in this review.

Licensed under the repository's MIT licence.

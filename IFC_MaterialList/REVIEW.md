# Review — 20 October 2026

Reviewed release: **1.0.1**. Two data-validity defects were reproduced and corrected: first-occurrence inclusion of duplicate GlobalIds and acceptance of whitespace-only IDs. Source names also now retain their original whitespace, as required by exact-name grouping. File reading moved to the worker and project lookup avoids a full entity-array allocation.

No unresolved publication-blocking issue was found within the tested scope.

## Extraction checks

All 15 checks passed: decimal grouping, duplicate identity exclusion, exclusion toggle and standard-case classes, missing/nonpositive lengths, blank IDs, conflicting lengths, explicit units, quantity lengths, STEP strings/Unicode/CSV safety, incomplete files/duplicate entity IDs, Revit-style section names/blank names, exact name whitespace, conversion units/length priority, synthetic scale, and optional real-fixture reconciliation.

The synthetic schedule contained 10,000 members and 40,003 entities. Extraction took approximately 210 ms in Node.js on the review computer; this is indicative, not a performance guarantee. Both embedded scripts compiled successfully.

## Browser checks

Headless Microsoft Edge successfully loaded the HTML directly from disk. Checks covered the Blob worker, file input, extraction, CSV/report/missing-data downloads, exclusion-setting reprocessing, incomplete-file error and subsequent valid-file recovery, and a 390-pixel viewport. The mobile screenshot was visually inspected. No page errors or HTTP(S) requests were observed during these interactions. Native chooser-dialog and drag-and-drop interaction were not separately automated; Chrome was not independently tested.

## Real IFC fixtures

Source IFCs are not included in this repository.

| Fixture | Entities | Candidates | Included | Excluded | Missing/invalid |
|---|---:|---:|---:|---:|---:|
| Fixture A, 609,912 bytes | 10,444 | 147 | 0 | 36 | 111 |
| Fixture B, 954,821 bytes | 14,472 | 147 | 47 | 36 | 64 |

All missing records lacked supported length properties/quantities. These files were originally used for geometry-based extraction and do not supply property lengths for every member. The tool correctly reports those members rather than deriving lengths from geometry. All candidate counts reconcile.

The supplied v1.0 documentation reports a separate 444,316-entity project IFC yielding 4,318 pieces and 663 rows. That source and its approved CSV were unavailable during this review, so those original claims were not independently repeated.

## Scope limits

Property-based lengths only; no geometry inference or fabrication/procurement allowances. Section lookup uses exporter labels rather than validating dimensional geometry. IFC2X3/IFC4 support covers the documented member/property forms, not the entire schemas. Unsupported units or malformed files are reported. Processing holds the parsed IFC graph in worker memory, so exceptionally large files remain limited by browser memory. No arbitrary maximum IFC size was established.

## Reproduce

From this folder, using a recent Node.js version:

```sh
node --test tests/extraction.test.cjs
```

To include local IFC fixtures in the reconciliation check:

```sh
node tests/extraction.test.cjs /path/to/first.ifc /path/to/second.ifc
```

Browser checks require the development dependency Playwright and an installed Microsoft Edge:

```sh
npm install
npm run test:browser
```

The standalone HTML requires neither Node.js nor Playwright.

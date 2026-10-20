# Changelog

## 1.0.1 — 2026-10-20

### Fixed

- Reject every occurrence of a duplicate member GlobalId, rather than counting whichever valid record is encountered first.
- Treat whitespace-only GlobalIds as missing.
- Preserve nonblank source name whitespace for exact grouping and export.

### Performance

- Read the selected File directly inside the worker, avoiding copying a full IFC text string from the page to the worker.
- Find the project entity without allocating an array containing all parsed entities.

### Validation

- Added 15 extraction checks, including a 10,000-member synthetic schedule.
- Tested local-file operation in headless Microsoft Edge: worker execution, extraction, material/report/issues downloads, exclusion changes, incomplete-file recovery and mobile layout.
- Both available real IFC fixtures reconcile supported candidates into included, excluded and missing-data records.

## 1.0 — 2026-10-20

Original supplied self-contained HTML tool and documentation.

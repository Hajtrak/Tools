# Hajtrak Revit MCP 0.9.0 — development build

This is a modified distribution of [KenLP/RevitMCPServer](https://github.com/KenLP/RevitMCPServer), based on upstream tag v0.8.40 (commit 4d273c6053be449e2066d0373d10b47c236de7ad). The original MIT licence and attribution are retained. Hajtrak branding identifies this derivative; it does not imply upstream endorsement. See [third-party notices](../THIRD_PARTY_NOTICES.md).

## Tool surface

All 94 upstream tools remain available with default profile settings. Four tools are added:
- revit_inspect_elements: up to 1000 IDs, identity/placement/parameters, optional detailed geometry and output field selection.
- revit_structural_snapshot: new local JSON file, checksum, host structural framing/column inventory, type parameters/section-property provenance, placement, grids, linked-file transforms and explicit completeness.
- revit_operation_status: journal lookup handled on the HTTP thread, so it can respond while Revit is busy.
- revit_save_document: ordinary save of an existing writable document. No Save As or central synchronisation. Preview skips saving.

98 tools in total. The generated src/McpServer/custom-tool-manifest.json records the schemas discovered through a real MCP client handshake; baseline-tools.json preserves the original 94 names.

## Source improvements across all 17 flagged tools

| Tool | Change in this build | Required live acceptance |
|---|---|---|
| get_element_geometry | Recursive geometry traversal, solid volume-weighted centroid separate from legacy box midpoint, location/orientation, explicit errors and units. | Nested, rotated and sloping families; compare native geometry. |
| get_linked_files | Link instance UniqueId, transform/reflection metadata, opt-in paths. | Repeated/mirrored/rotated and unloaded links. |
| get_linked_elements | Eight-corner transformed boxes, host locations, stable link identity, deterministic paging and true total. | Compare known points/boxes and full pagination. |
| create_beam | Preserve explicit Z, level-relative end offsets, exact type selection, cross-section rotation and read-back. | Elevated/sloping members, reference level and physical ends/joins. |
| create_column | Correct family-category resolution, preserve explicit base Z, optional top constraint/offset, exact type selection and read-back. | Base/top levels/offsets and correct category. |
| place_family_instance | Exact type ID, category validation, candidate response for any ambiguous selection, explicit elevation, reject unsupported host fallback, location/type/host checks. | Hosted/non-hosted examples and structural support families. |
| change_element_type | Replacement-ID handling, before/after placement, actual type parameters, post-commit placement evidence. | Inherited rotation/offset/material changes and support relations. These are reported, not automatically engineered away. |
| duplicate_family_type | Optional parameter schedule in the same transaction, value read-back, post-commit checks and created ID. | Correct dimensions/properties; no renamed-only approval. |
| set_parameter | Stable parameter ID, ambiguous-name rejection, protected review fields, type-scope indication, explicit angle units. | Real parameter/storage/unit variants and read-only cases. |
| set_parameter_batch | Per-row subtransactions and read-back; failed rows roll back; explicit atomic and written-ID results; stable parameter IDs. | Partial and atomic failures, constraints and commit-time effects. |
| update_where | Preview match token over identities/type/raw target values, protected-field guard and per-row rollback. | Stale-preview rejection and collateral type impact. |
| move_element | Regenerate before after-state capture; placement evidence plus dispatcher dependency-event IDs. | Stair assembly/group/connected-member moves; final net state must be inspected. |
| rotate_element | Optional arbitrary axis; separate absolute framing cross-section rotation; transformed anchor read-back. | Native orientation and dependent changes; anchor verification alone is not full-solid orientation proof. |
| batch | Journaled logical operation tracking, isolated failed write steps, optional document binding, pre-commit checks under strict verification policy, reject file exports mixed with model writes. | Undo/rollback, superseded writes, timeout recovery and partial mode. |
| check_clearance | Eight-corner linked boxes; link-aware bounding-box pair identity; input/result limit metadata; label native intersections versus box candidates and sampled rays. | Representative host/link clashes and raycasts. |
| get_model_health | Heuristic policy/version and meaning, purge-scan status; recipes labelled advisory. | Correct metrics, omitted/deep-scan disclosure. |
| get_worksets | Owner metadata opt-in, explicit count scope and closed-workset completeness. | Workshared/non-workshared and closed-workset fixtures. |

All rows are source changes awaiting their live acceptance cases; automated tests do not establish native Revit geometry correctness.

## Shared behaviour

- Development builds default to DeployToRevit=false.
- Writes require the custom add-in health protocol pmk-1. The bridge will not silently use the upstream add-in for modified write behaviour.
- The bridge establishes a session document key before writes unless explicitly supplied; the add-in checks it on the Revit thread before execution.
- Each logical write has operationId, separate from the HTTP request ID. Supply the same operation ID and exact payload for retry reconciliation; use different IDs for preview and commit. A new logical operation is not a safe retry of an unknown earlier one.
- Operation records are stored locally in %APPDATA%/RevitMCP.Custom/operations-<port>.jsonl, with fingerprints and results, never bearer tokens. Preview results may contain short-lived approval tokens; protect the journal as local application state.
- Completed results can be recovered after restart. Pending/running records become unknown and are not replayed. A crash around commit can leave an unknown outcome. This is conservative duplicate prevention, not a guarantee of exactly-once execution.
- The journal has a bounded record count and fails closed if corrupted or full. Do not delete/reset it to force an ambiguous edit through. Reconcile model state before maintenance. No automated archive policy is provided yet.
- DocumentChanged events expose dependent IDs. These are observed event IDs, potentially including transient/rolled-back changes, not a proven final net diff.
- Strict verification adds a pre-commit check in a rollback-capable transaction; the post-commit check remains. In report mode a failed verification may accompany a committed write. Configure and validate policy explicitly before production.
- Unknown coordinate units and non-finite numeric inputs are rejected. Existing metres/feet and parameter internal-unit contracts remain; angle parameter conversion now supports degrees/radians.
- Protected review fields reject nonblank writes through the modified parameter paths unless a task-specific override is explicitly supplied.
- Personal identity fields are opt-in on version/document/workset queries. Project paths can still appear where the operation needs them.
- Dependencies were updated and audited; audit results are time-specific, not a permanent guarantee.

## Deliberate compatibility changes

- Beam/column Z is honoured when explicitly supplied, including explicit zero; omitted Z uses the selected level. Old scripts that accidentally relied on Z being ignored need adjustment.
- Ambiguous structural types no longer choose the first match. Supply typeId or an unambiguous family/type.
- Generic family placement no longer silently ignores an unsupported host.
- Personal metadata is opt-in. Add includeUsername/includePersonalMetadata/includeOwners/includePaths when needed.
- Several write tools that previously lacked a visible dryRun field now expose preview and operation controls.
- Existing tool names and legacy result fields remain. The old geometry centroid field still means the box midpoint; use volumeCentroidFeet for the computed solid centroid.
- Normalised section dimensions use built-in parameters with source IDs and units. Missing properties remain unavailable; type names are never parsed as proof of dimensions.

## Scope and remaining work

The current snapshot exports host structural framing and columns. It includes linked-file metadata/transforms, but not linked members, stair steel in other categories, structural foundations or all native stair objects. Detailed linked reads remain available through get_linked_elements. Counts and complete refer to the declared scope, not the whole model or every section property.

Snapshot export is synchronous to keep one coherent Revit-thread read. Large models may keep Revit busy. Chunking/change stamps, incremental refresh, richer link/category scope and caching remain to be measured and designed.

Native stair/railing creation, structural takeoff export, automatic support checks, richer review issue application and the full roadmap are not implemented by this development increment. The source implementation is not the complete roadmap or an approved production release.

## Validation and cutover

1. Run TypeScript build/tests, .NET tests with deployment disabled, scripts/check-version.mjs and the real MCP discovery check.
2. Stage release binaries and runtime-only bridge dependencies. Verify package hashes.
3. Close Revit and install the custom build for a disposable test model using a reviewed backup/rollback procedure.
4. Run the live acceptance matrix for all 17 tools and representative checks from every retained command family. Compare snapshot counts, geometry and extraction timings to native/direct baseline.
5. Confirm ordinary save on the test copy and observe the journal under simulated disconnection/restart.
6. Only then use the custom build on production work. Keep one active MCP entry and one active add-in, preserving the old package/configuration for rollback.

No speed improvement percentage or native correctness claim is made before this live trial.

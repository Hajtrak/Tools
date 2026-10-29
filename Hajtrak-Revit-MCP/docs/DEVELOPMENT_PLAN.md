# Development plan

Retain all 94 inherited MCP tools. Improve the 17 identified structural/inspection/coordination tools and shared execution reliability. Keep one active Revit integration after replacement.

## Implemented development increment

See [CUSTOM_BUILD.md](CUSTOM_BUILD.md) for per-tool source changes and acceptance cases. Four additions bring the surface to 98 tools: batch inspection, host structural snapshot, operation status and ordinary save.

## Acceptance work

1. Verify exact document/type identity and complete scoped inventories.
2. Test horizontal, elevated, sloping and offset members against native geometry and properties.
3. Check inherited rotation, justification, offsets and material after type swaps.
4. Test repeated/rotated/mirrored links, paging and coordinate transforms.
5. Verify rollback/undo, partial failures, stale previews and dependent assembly movement.
6. Exercise client disconnect, duplicate submission and restart recovery. Unknown commit outcomes must remain explicit.
7. Reconcile snapshot counts and compare extraction time/call count with equivalent direct reads.
8. Test ordinary save in a disposable local model and representative commands from all retained tool families.

## Later increments

- Broader linked/category snapshot scope, chunking and validated change stamps.
- Native architectural stairs/railings with separately measured structural steel.
- Structured takeoff export with property provenance and exclusions.
- Repeatable review issue application, coverage export and advanced support checks.
- Incremental extraction only after invalidation and completeness are proven.
- General clean-machine installer and signed release packaging.

No production release or benchmark claim is made until appropriate live acceptance is recorded.

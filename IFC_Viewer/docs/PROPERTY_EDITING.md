# Element fields and IFC editing

The viewer discovers property sets and quantities from the source IFC, preserving custom field names and raw IFC units. Type properties have a `Type` prefix; instance values remain separate. Lists, enumerations, bounds, tables, references and complex properties are exposed as additional fields. Duplicate names receive an express-ID suffix. Elements without geometry also appear in the list when a model has displayable geometry.

On first use all discovered fields are visible, with no grouping or fixed column preset. Choose fields independently for the element panel and table. Search field names in Columns, toggle any column, and reorder with arrows or by dragging table headings. Grouping is optional. The current choices are saved locally; old fixed presets are not migrated.

Click a row to select it. Ctrl-click toggles rows. Select matching selects every element matching the search, including rows beyond the displayed page. Group rows select all their members.

Choose Edit properties in the selected-element panel. Use Search properties to filter the existing-field list by property or property-set name; clearing the search restores all fields. Your current field selection and typed value are preserved while filtering. Existing scalar properties, simple quantities and the Name, Description, ObjectType and Tag attributes can be edited when present. New text, number or boolean properties can be added to a named property set; Comments, Notes and Work Group are suggested names. Apply updates every selected element. Existing fields must exist on every selected target and have a compatible value type. Type property edits create instance overrides. Shared property sets are cloned for each edited element so other elements are unaffected.

Save IFC as writes a new IFC file. Existing files cannot be overwritten, including the source. The source is reopened and staged edits replayed for each export; geometry, placements and element identifiers are not edited. Exported files can be reopened normally. Save edits you want to retain before opening another model or exiting the application.

## Current limits

- Structured/list/enumerated/bounded/table/reference properties are visible but read-only. Geometry, identifiers and relationship fields are read-only.
- Multi-set property-definition relationships are discoverable, but editing those relationships is unsupported and export reports an error.
- New properties support text, number and boolean values. There is no property deletion, undo history, custom unit editor or named layout library.
- A type override retains the inherited type field and adds an instance field after reopening.
- Raw values retain source units; there are no inferred length/weight totals based on a fixed vocabulary.
- Tested with synthetic IFC2X3 and IFC4 files. IFC4x3 and large external production files have not been verified. Reading/edit export uses an additional in-memory IFC model and can pause the interface on large files.
- Export serializes IFC through web-ifc; formatting and new property-set identifiers can change. This is not a byte-preserving STEP editor.

## Verification

`npm test` runs existing material/display/grid tests plus IFC round-trip tests covering custom names, list values, shared-property isolation, type overrides, adding to existing sets, bulk edits, Unicode, stable original element GlobalIds and identical generated geometry vertices/indices.

`npm run build` checks TypeScript and produces the local viewer assets. Existing upstream Three.js/That Open optional WebGPU import and bundle-size warnings remain.

After the build, `node scripts/test-editor.mjs` launches Electron with a disposable local profile and synthetic IFC to test discovery, ungrouped columns, bulk editing, field visibility, native save, overwrite rejection and reopening the edited file. It requires a local desktop session. No user model is used by these tests.

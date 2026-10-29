using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Autodesk.Revit.DB;

namespace RevitMCPAddin.Commands;

public static class StructuralInspection
{
    private static readonly string Session = Guid.NewGuid().ToString("N");
    public static string DocumentKey(Document doc) => $"{Session}:{doc.GetHashCode():x}:{doc.ProjectInformation.UniqueId}";
    public static JsonObject SectionProperties(Element? type)
    {
        var result = new JsonObject();
        foreach (var (key, parameter, units) in new[] {
            ("height", BuiltInParameter.STRUCTURAL_SECTION_COMMON_HEIGHT, "feet"),
            ("width", BuiltInParameter.STRUCTURAL_SECTION_COMMON_WIDTH, "feet"),
            ("webThickness", BuiltInParameter.STRUCTURAL_SECTION_ISHAPE_WEBTHICKNESS, "feet"),
            ("flangeThickness", BuiltInParameter.STRUCTURAL_SECTION_ISHAPE_FLANGETHICKNESS, "feet"),
            ("area", BuiltInParameter.STRUCTURAL_SECTION_AREA, "square-feet") })
        {
            var p = type?.get_Parameter(parameter);
            result[key] = new JsonObject { ["value"] = p is { HasValue: true, StorageType: StorageType.Double } ? JsonValue.Create(p.AsDouble()) : null,
                ["units"] = units, ["sourceParameter"] = parameter.ToString(), ["sourceTypeId"] = type?.Id.Value,
                ["status"] = p is { HasValue: true, StorageType: StorageType.Double } ? "model-parameter" : "unavailable" };
        }
        return result;
    }
    public static JsonObject Parameters(Element e)
    {
        var rows = new JsonArray();
        foreach (Parameter p in e.Parameters)
        {
            var row = new JsonObject { ["id"] = p.Id.Value, ["name"] = p.Definition.Name,
                ["storageType"] = p.StorageType.ToString(), ["readOnly"] = p.IsReadOnly,
                ["hasValue"] = p.HasValue, ["specTypeId"] = p.Definition.GetDataType().TypeId };
            row["value"] = p.HasValue ? p.StorageType switch
            {
                StorageType.Double => JsonValue.Create(p.AsDouble()),
                StorageType.Integer => JsonValue.Create(p.AsInteger()),
                StorageType.String => JsonValue.Create(p.AsString()),
                StorageType.ElementId => JsonValue.Create(p.AsElementId().Value), _ => null,
            } : null;
            row["valueUnits"] = p.StorageType == StorageType.Double ? "Revit internal units; interpret specTypeId" : null;
            rows.Add(row);
        }
        return new JsonObject { ["values"] = rows };
    }

    public static JsonObject Inspect(Document doc, Element e, bool geometry, bool parameters)
    {
        var type = doc.GetElement(e.GetTypeId());
        var result = new JsonObject { ["id"] = e.Id.Value, ["uniqueId"] = e.UniqueId,
            ["documentKey"] = DocumentKey(doc), ["name"] = e.Name, ["category"] = e.Category?.BuiltInCategory.ToString(),
            ["typeId"] = e.GetTypeId().Value, ["typeName"] = type?.Name,
            ["familyName"] = (e as FamilyInstance)?.Symbol.FamilyName,
            ["levelId"] = e.LevelId.Value, ["groupId"] = e.GroupId.Value,
            ["assemblyInstanceId"] = e.AssemblyInstanceId.Value, ["phaseCreatedId"] = e.CreatedPhaseId.Value,
            ["phaseDemolishedId"] = e.DemolishedPhaseId.Value, ["designOptionId"] = e.DesignOption?.Id.Value,
            ["location"] = GeometryRead.Location(e), ["boundingBox"] = GeometryRead.Box(e.get_BoundingBox(null)),
            ["placement"] = PlacementState.Read(e), ["sectionProperties"] = SectionProperties(type),
            ["materialIds"] = new JsonArray(e.GetMaterialIds(false).Select(id => (JsonNode?)new JsonObject {
                ["id"] = id.Value, ["name"] = doc.GetElement(id)?.Name }).ToArray()) };
        if (parameters) result["instanceParameters"] = Parameters(e);
        if (geometry) result["geometry"] = GeometryRead.Read(e);
        return result;
    }
}

public sealed class InspectElementsCommand : IRevitCommand
{
    public string Name => "inspect_elements";
    public bool IsReadOnly => true;
    public JsonNode? Execute(CommandContext ctx)
    {
        var doc = ctx.RequireDoc();
        var ids = P.Arr(ctx.Parameters, "ids");
        if (ids.Count > 1000) throw new RevitCommandException("invalid_parameter", "Inspect at most 1000 IDs per call.");
        var rows = new JsonArray(); var errors = new JsonArray();
        foreach (var node in ids)
        {
            long? id = null;
            try
            {
                id = P.LongFrom(node!, "ids[]");
                var e = doc.GetElement(new ElementId(id.Value)) ?? throw new RevitCommandException("not_found", "Element not found.");
                var row = StructuralInspection.Inspect(doc, e, P.BoolOr(ctx.Parameters, "includeGeometry", false), P.BoolOr(ctx.Parameters, "includeParameters", true));
                if (ctx.Parameters["fields"] is JsonArray fields)
                {
                    var keep = fields.Select(f => P.StrFrom(f!, "fields[]")).Concat(new[] { "id", "uniqueId", "documentKey" }).ToHashSet(StringComparer.Ordinal);
                    foreach (var key in row.Select(pair => pair.Key).Where(key => !keep.Contains(key)).ToArray()) row.Remove(key);
                }
                rows.Add(row);
            }
            catch (Exception ex) { errors.Add(new JsonObject { ["id"] = id, ["message"] = ex.Message }); }
        }
        return new JsonObject { ["documentKey"] = StructuralInspection.DocumentKey(doc), ["requestedCount"] = ids.Count,
            ["returnedCount"] = rows.Count, ["errorCount"] = errors.Count, ["elements"] = rows, ["errors"] = errors,
            ["complete"] = errors.Count == 0, ["lengthUnits"] = "feet", ["coordinateFrame"] = "document-internal" };
    }
}

public sealed class StructuralSnapshotCommand : IRevitCommand
{
    public string Name => "structural_snapshot";
    public bool IsReadOnly => true;
    public JsonNode? Execute(CommandContext ctx)
    {
        var doc = ctx.RequireDoc();
        var p = ctx.Parameters;
        var output = P.Str(p, "outputPath");
        if (!Path.IsPathFullyQualified(output) || !output.EndsWith(".json", StringComparison.OrdinalIgnoreCase))
            throw new RevitCommandException("invalid_parameter", "outputPath must be an absolute .json path.");
        if (File.Exists(output)) throw new RevitCommandException("invalid_parameter", "Snapshot already exists. Use a new versioned filename.");
        if (ctx.DryRun) return new JsonObject { ["skipped"] = true, ["reason"] = "Snapshot file export skipped during dry run." };
        var started = DateTime.UtcNow;
        var rows = new JsonArray(); var types = new JsonArray(); var errors = new JsonArray();
        var typeIds = new HashSet<long>();
        var ids = new FilteredElementCollector(doc).WhereElementIsNotElementType()
            .WherePasses(new ElementMulticategoryFilter(new[] { BuiltInCategory.OST_StructuralFraming, BuiltInCategory.OST_StructuralColumns }))
            .ToElementIds().OrderBy(id => id.Value).ToList();
        foreach (var id in ids)
        {
            try
            {
                var e = doc.GetElement(id);
                rows.Add(StructuralInspection.Inspect(doc, e, P.BoolOr(p, "includeGeometry", false), true));
                var type = doc.GetElement(e.GetTypeId());
                if (type is not null && typeIds.Add(type.Id.Value))
                    types.Add(new JsonObject { ["id"] = type.Id.Value, ["uniqueId"] = type.UniqueId, ["name"] = type.Name,
                        ["sectionProperties"] = StructuralInspection.SectionProperties(type),
                        ["familyName"] = (type as FamilySymbol)?.FamilyName, ["parameters"] = StructuralInspection.Parameters(type) });
            }
            catch (Exception ex) { errors.Add(new JsonObject { ["id"] = id.Value, ["message"] = ex.Message }); }
        }
        var links = new GetLinkedFilesCommand().Execute(ctx);
        var grids = new JsonArray(new FilteredElementCollector(doc).OfClass(typeof(Grid)).Cast<Grid>()
            .Select(g => (JsonNode?)new JsonObject { ["id"] = g.Id.Value, ["name"] = g.Name,
                ["curveType"] = g.Curve.GetType().Name, ["startFeet"] = g.Curve.IsBound ? ReadBack.Xyz(g.Curve.GetEndPoint(0)) : null,
                ["endFeet"] = g.Curve.IsBound ? ReadBack.Xyz(g.Curve.GetEndPoint(1)) : null }).ToArray());
        var geometryPartialCount = rows.Count(row => row?["geometry"]?["geometryStatus"]?.GetValue<string>() == "partial");
        var snapshot = new JsonObject { ["schemaVersion"] = "1.0", ["documentKey"] = StructuralInspection.DocumentKey(doc),
            ["persistentProjectIdentity"] = doc.ProjectInformation.UniqueId,
            ["documentTitle"] = doc.Title, ["startedUtc"] = started.ToString("O"), ["finishedUtc"] = DateTime.UtcNow.ToString("O"),
            ["lengthUnits"] = "feet", ["coordinateFrame"] = "document-internal",
            ["projectTransform"] = GeometryRead.TransformJson(doc.ActiveProjectLocation.GetTotalTransform()),
            ["expectedCount"] = ids.Count, ["exportedCount"] = rows.Count, ["errorCount"] = errors.Count,
            ["complete"] = errors.Count == 0 && geometryPartialCount == 0, ["geometryPartialCount"] = geometryPartialCount,
            ["elements"] = rows, ["types"] = types, ["links"] = links, ["grids"] = grids,
            ["errors"] = errors, ["scope"] = "host structural framing and structural columns; links metadata only",
            ["consistency"] = "single synchronous Revit API execution; no yield between member reads",
            ["limitations"] = new JsonArray("Drawing compliance is not evaluated.", "Normalised dimensions use built-in type parameters only; missing family properties remain unavailable.",
                "Material names are model assignments, not grade certification.", "Linked members, stairs, structural foundations and other categories are outside this snapshot scope.") };
        var bytes = Encoding.UTF8.GetBytes(snapshot.ToJsonString(new System.Text.Json.JsonSerializerOptions { WriteIndented = true }));
        var staged = output + ".writing-" + Guid.NewGuid().ToString("N");
        using (var stream = new FileStream(staged, FileMode.CreateNew, FileAccess.Write, FileShare.None)) { stream.Write(bytes); stream.Flush(true); }
        File.Move(staged, output);
        return new JsonObject { ["outputPath"] = output, ["sha256"] = Convert.ToHexString(SHA256.HashData(bytes)),
            ["bytes"] = bytes.Length, ["expectedCount"] = ids.Count, ["exportedCount"] = rows.Count, ["errorCount"] = errors.Count,
            ["complete"] = errors.Count == 0 && geometryPartialCount == 0, ["geometryPartialCount"] = geometryPartialCount, ["scope"] = snapshot["scope"]!.DeepClone(),
            ["durationMs"] = (DateTime.UtcNow - started).TotalMilliseconds };
    }
}

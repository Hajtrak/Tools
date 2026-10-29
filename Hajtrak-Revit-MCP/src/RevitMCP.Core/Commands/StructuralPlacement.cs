using System.Text.Json.Nodes;
using Autodesk.Revit.DB;

namespace RevitMCPAddin.Commands;

/// <summary>Shared exact type resolution and explicit versus omitted elevation handling.</summary>
public static class StructuralPlacement
{
    public static XYZ AtLevelWhenZMissing(JsonObject p, string key, XYZ point, Level level) =>
        p[key] is JsonObject o && o["z"] is not null ? point : new XYZ(point.X, point.Y, level.Elevation);

    public static FamilySymbol Resolve(Document doc, JsonObject p, params BuiltInCategory[] categories)
    {
        var family = P.StrOrNull(p, "familyName");
        var type = P.StrOrNull(p, "familyTypeName");
        var query = new FilteredElementCollector(doc).OfClass(typeof(FamilySymbol)).Cast<FamilySymbol>()
            .Where(s => categories.Length == 0 || categories.Contains(s.Category?.BuiltInCategory ?? BuiltInCategory.INVALID));
        if (p["typeId"] is not null) query = query.Where(s => s.Id.Value == P.Long(p, "typeId"));
        if (!string.IsNullOrWhiteSpace(family)) query = query.Where(s => s.FamilyName.Equals(family, StringComparison.OrdinalIgnoreCase));
        if (!string.IsNullOrWhiteSpace(type)) query = query.Where(s => s.Name.Equals(type, StringComparison.OrdinalIgnoreCase));
        var matches = query.Take(2).ToList();
        if (matches.Count == 0) throw new RevitCommandException("not_found", "No compatible loaded family type matches the requested identity.");
        if (matches.Count != 1) throw new RevitCommandException("invalid_parameter", "Multiple family types match. Supply an exact typeId or unambiguous familyName and familyTypeName.");
        return matches[0];
    }

    public static void SetDouble(Element e, BuiltInParameter id, double value)
    {
        var parameter = e.get_Parameter(id);
        if (parameter is null || parameter.IsReadOnly)
            throw new RevitCommandException("read_only_parameter", $"Required placement parameter {id} is unavailable or read-only.");
        parameter.Set(value);
    }
}

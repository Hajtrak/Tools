using System.Text.Json.Nodes;
using Autodesk.Revit.DB;
namespace RevitMCPAddin.Commands;
public static class PlacementState
{
    public static JsonObject Read(Element element)
    {
        var parameters = new JsonObject();
        foreach (var name in new[] { "INSTANCE_REFERENCE_LEVEL_PARAM", "FAMILY_BASE_LEVEL_PARAM", "FAMILY_TOP_LEVEL_PARAM",
            "FAMILY_BASE_LEVEL_OFFSET_PARAM", "FAMILY_TOP_LEVEL_OFFSET_PARAM", "STRUCTURAL_BEAM_END0_ELEVATION",
            "STRUCTURAL_BEAM_END1_ELEVATION", "STRUCTURAL_BEND_DIR_ANGLE", "Y_JUSTIFICATION", "Z_JUSTIFICATION",
            "Y_OFFSET_VALUE", "Z_OFFSET_VALUE", "STRUCTURAL_MATERIAL_PARAM" })
        {
            if (!Enum.TryParse<BuiltInParameter>(name, out var id)) continue;
            var p = element.get_Parameter(id);
            if (p is not null) parameters[name] = p.StorageType switch {
                StorageType.Double => JsonValue.Create(p.AsDouble()), StorageType.ElementId => JsonValue.Create(p.AsElementId().Value),
                StorageType.Integer => JsonValue.Create(p.AsInteger()), _ => JsonValue.Create(p.AsString()) };
        }
        return new JsonObject { ["typeId"] = element.GetTypeId().Value, ["location"] = GeometryRead.Location(element),
            ["placementParametersInternal"] = parameters, ["boundingBoxFeet"] = GeometryRead.Box(element.get_BoundingBox(null)) };
    }
}

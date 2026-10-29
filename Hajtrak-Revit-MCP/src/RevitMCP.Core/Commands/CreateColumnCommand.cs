using System;
using System.Linq;
using System.Text.Json.Nodes;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Structure;

namespace RevitMCPAddin.Commands;

/// <summary>
/// Place a structural column at a point.
///
/// Params:
///   - location:       { x, y, z? }
///   - levelName:      string, optional
///   - familyTypeName: string, optional (e.g. "W10X49")
///   - familyName:     string, optional
///   - structural:     bool, default true
///   - units:          "meters"|"feet"
/// </summary>
public sealed class CreateColumnCommand : IRevitCommand, IVerifiableCommand
{
    public string Name => "create_column";
    public bool IsReadOnly => false;

    public JsonNode? Execute(CommandContext ctx)
    {
        var doc = ctx.RequireDoc();
        var p = ctx.Parameters;
        var units = P.Units(p);

        var location = P.Xyz(p, "location", units);
        var level = CreateWallCommand.ResolveLevel(doc, P.StrOrNull(p, "levelName"));
        var structural = P.BoolOr(p, "structural", true);

        var symbol = StructuralPlacement.Resolve(doc, p, structural ? BuiltInCategory.OST_StructuralColumns : BuiltInCategory.OST_Columns);

        if (!symbol.IsActive) { symbol.Activate(); doc.Regenerate(); }

        var pt = StructuralPlacement.AtLevelWhenZMissing(p, "location", location, level);
        var stype = structural ? StructuralType.Column : StructuralType.NonStructural;
        var instance = doc.Create.NewFamilyInstance(pt, symbol, level, stype);
        StructuralPlacement.SetDouble(instance, BuiltInParameter.FAMILY_BASE_LEVEL_OFFSET_PARAM, pt.Z - level.Elevation);
        if (p["topLevelName"] is not null)
        {
            var top = CreateWallCommand.ResolveLevel(doc, P.Str(p, "topLevelName"));
            var topParameter = instance.get_Parameter(BuiltInParameter.FAMILY_TOP_LEVEL_PARAM);
            if (topParameter is null || topParameter.IsReadOnly) throw new RevitCommandException("read_only_parameter", "Top level constraint cannot be set.");
            topParameter.Set(top.Id);
            StructuralPlacement.SetDouble(instance, BuiltInParameter.FAMILY_TOP_LEVEL_OFFSET_PARAM, P.DblOr(p, "topOffset", 0) * P.LengthScale(units));
        }
        doc.Regenerate();

        return new JsonObject
        {
            ["affected"] = Affected.Created(instance.Id.Value),
            ["id"] = instance.Id.Value,
            ["typeId"] = symbol.Id.Value,
            ["levelId"] = level.Id.Value,
            ["expectedLocationFeet"] = ReadBack.Xyz(pt),
            ["placementAfter"] = PlacementState.Read(instance),
            ["familyTypeName"] = symbol.Name,
            ["familyName"] = symbol.FamilyName,
            ["levelName"] = level.Name,
        };
    }

    internal static FamilySymbol ResolveFamilySymbol(
        Document doc, string? familyName, string? typeName,
        params BuiltInCategory[] categories)
    {
        return StructuralPlacement.Resolve(doc, new JsonObject { ["familyName"] = familyName, ["familyTypeName"] = typeName }, categories);
    }

    public VerifyResult Verify(CommandContext ctx, JsonObject result)
    {
        var instance = ctx.RequireDoc().GetElement(new ElementId(result["id"]!.GetValue<long>()));
        if (instance is null) return VerifyResult.Fail("Column missing after commit.");
        var errors = new List<string>();
        if (instance.GetTypeId().Value != result["typeId"]!.GetValue<long>()) errors.Add("Column type mismatch.");
        if (instance.get_Parameter(BuiltInParameter.FAMILY_BASE_LEVEL_PARAM)?.AsElementId().Value != result["levelId"]!.GetValue<long>()) errors.Add("Column base level mismatch.");
        if (ReadBack.Point("location", ReadBack.Xyz(result["expectedLocationFeet"])!, ReadBack.Anchor(instance)) is string m) errors.Add(m);
        if (ctx.Parameters["topLevelName"] is not null)
        {
            var top = CreateWallCommand.ResolveLevel(ctx.RequireDoc(), P.Str(ctx.Parameters, "topLevelName"));
            if (instance.get_Parameter(BuiltInParameter.FAMILY_TOP_LEVEL_PARAM)?.AsElementId().Value != top.Id.Value) errors.Add("Column top level mismatch.");
            if (ReadBack.Number("top offset", P.DblOr(ctx.Parameters, "topOffset", 0) * P.LengthScale(P.Units(ctx.Parameters)),
                instance.get_Parameter(BuiltInParameter.FAMILY_TOP_LEVEL_OFFSET_PARAM)?.AsDouble() ?? double.NaN, ReadBack.LengthTolFt, "feet") is string t) errors.Add(t);
        }
        return ReadBack.FromMismatches(errors);
    }
}

using System;
using System.Linq;
using System.Text.Json.Nodes;
using Autodesk.Revit.DB;
using Autodesk.Revit.DB.Structure;

namespace RevitMCPAddin.Commands;

/// <summary>
/// Place a structural beam between two points.
///
/// Params:
///   - start, end:     { x, y, z? }
///   - levelName:      string, optional
///   - familyTypeName: string, optional
///   - familyName:     string, optional
///   - structural:     bool, default true
///   - units:          "meters"|"feet"
/// </summary>
public sealed class CreateBeamCommand : IRevitCommand, IVerifiableCommand
{
    public string Name => "create_beam";
    public bool IsReadOnly => false;

    public JsonNode? Execute(CommandContext ctx)
    {
        var doc = ctx.RequireDoc();
        var p = ctx.Parameters;
        var units = P.Units(p);

        var start = P.Xyz(p, "start", units);
        var end = P.Xyz(p, "end", units);
        var level = CreateWallCommand.ResolveLevel(doc, P.StrOrNull(p, "levelName"));
        start = StructuralPlacement.AtLevelWhenZMissing(p, "start", start, level);
        end = StructuralPlacement.AtLevelWhenZMissing(p, "end", end, level);
        if (start.DistanceTo(end) < ctx.App.Application.ShortCurveTolerance)
            throw new RevitCommandException("invalid_parameter", "Beam is shorter than Revit's short curve tolerance.");
        var structural = P.BoolOr(p, "structural", true);

        var symbol = StructuralPlacement.Resolve(doc, p, BuiltInCategory.OST_StructuralFraming);

        if (!symbol.IsActive) { symbol.Activate(); doc.Regenerate(); }

        var line = Line.CreateBound(start, end);
        var stype = structural ? StructuralType.Beam : StructuralType.NonStructural;
        var instance = doc.Create.NewFamilyInstance(line, symbol, level, stype);
        doc.Regenerate();
        // Set the level-relative end elevations explicitly: some families reset these on placement.
        StructuralPlacement.SetDouble(instance, BuiltInParameter.STRUCTURAL_BEAM_END0_ELEVATION, start.Z - level.Elevation);
        StructuralPlacement.SetDouble(instance, BuiltInParameter.STRUCTURAL_BEAM_END1_ELEVATION, end.Z - level.Elevation);
        if (p["crossSectionRotationDeg"] is not null)
            StructuralPlacement.SetDouble(instance, BuiltInParameter.STRUCTURAL_BEND_DIR_ANGLE, P.Dbl(p, "crossSectionRotationDeg") * Math.PI / 180);
        doc.Regenerate();

        return new JsonObject
        {
            ["affected"] = Affected.Created(instance.Id.Value),
            ["id"] = instance.Id.Value,
            ["typeId"] = symbol.Id.Value,
            ["levelId"] = level.Id.Value,
            ["expectedStartFeet"] = ReadBack.Xyz(start),
            ["expectedEndFeet"] = ReadBack.Xyz(end),
            ["familyTypeName"] = symbol.Name,
            ["familyName"] = symbol.FamilyName,
            ["levelName"] = level.Name,
            ["lengthFeet"] = line.Length,
        };
    }

    public VerifyResult Verify(CommandContext ctx, JsonObject result)
    {
        var instance = ctx.RequireDoc().GetElement(new ElementId(result["id"]!.GetValue<long>()));
        if (instance?.Location is not LocationCurve location) return VerifyResult.Fail("Placed beam has no location curve.");
        var errors = new List<string>();
        if (ReadBack.Point("start", ReadBack.Xyz(result["expectedStartFeet"])!, location.Curve.GetEndPoint(0)) is string a) errors.Add(a);
        if (ReadBack.Point("end", ReadBack.Xyz(result["expectedEndFeet"])!, location.Curve.GetEndPoint(1)) is string b) errors.Add(b);
        if (instance.GetTypeId().Value != result["typeId"]!.GetValue<long>()) errors.Add("Beam type changed during placement.");
        if (instance.get_Parameter(BuiltInParameter.INSTANCE_REFERENCE_LEVEL_PARAM)?.AsElementId().Value != result["levelId"]!.GetValue<long>()) errors.Add("Reference level differs from requested level.");
        if (ctx.Parameters["crossSectionRotationDeg"] is not null && ReadBack.Number("cross section rotation", P.Dbl(ctx.Parameters, "crossSectionRotationDeg") * Math.PI / 180,
            instance.get_Parameter(BuiltInParameter.STRUCTURAL_BEND_DIR_ANGLE)?.AsDouble() ?? double.NaN, ReadBack.AngleTolRad, "radians") is string r) errors.Add(r);
        return ReadBack.FromMismatches(errors);
    }
}

using System.Collections.Generic;
using System.Linq;
using System.Text.Json.Nodes;
using Autodesk.Revit.DB;

namespace RevitMCPAddin.Commands;

/// <summary>
/// Create a Floor preserving a horizontal or single-plane sloping profile.
///
/// Parameters:
///   - profile:        [{x,y,z?}, ...]   required, at least 3 points, closed automatically
///   - levelName:      string             optional, defaults to lowest level
///   - floorTypeName:  string             optional, defaults to first FloorType
///   - units:          "meters"|"feet"    optional, default "meters"
///   - structural:     bool               optional, default false; supports not required
/// Explicit profile Z values are absolute; all omitted Z values use the level.
/// Native top-face verification fails creation instead of flattening elevations.
/// </summary>
public sealed class CreateFloorCommand : IRevitCommand
{
    public string Name => "create_floor";
    public bool IsReadOnly => false;

    public JsonNode? Execute(CommandContext ctx)
    {
        var doc = ctx.RequireDoc();
        var p = ctx.Parameters;
        var units = P.Units(p);

        var pts = P.XyzList(p, "profile", units);
        if (pts.Count < 3)
            throw new RevitCommandException("invalid_parameter", "Floor profile must have at least 3 points.");

        var level = CreateWallCommand.ResolveLevel(doc, P.StrOrNull(p, "levelName"));
        var floorType = ResolveFloorType(doc, P.StrOrNull(p, "floorTypeName"));

        // Omitted Z means the reference level. Explicit zero remains absolute zero.
        var rawPoints = (JsonArray)p["profile"]!;
        if (rawPoints.Any(n => n?["z"] != null) && rawPoints.Any(n => n?["z"] == null))
            throw new RevitCommandException("invalid_parameter", "Specify Z on every floor profile point or omit Z on all points.");
        if (rawPoints.All(n => n?["z"] == null))
            pts = pts.Select(v => new XYZ(v.X, v.Y, level.Elevation)).ToList();
        if (pts.Count > 3 && pts[0].DistanceTo(pts[^1]) < FloorProfilePlane.ToleranceFeet)
            pts.RemoveAt(pts.Count - 1);
        var plane = FloorProfilePlane.Fit(pts.Select(v => new FloorPoint(v.X, v.Y, v.Z)).ToList());
        var structural = P.BoolOr(p, "structural", false);

        // Revit requires a horizontal sketch. Preserve the requested plane separately
        // through a native slope arrow and height offset, then verify the actual top faces.
        var loop = new CurveLoop();
        for (var i = 0; i < pts.Count; i++)
        {
            var a = new XYZ(pts[i].X, pts[i].Y, level.Elevation);
            var bRaw = pts[(i + 1) % pts.Count];
            var b = new XYZ(bRaw.X, bRaw.Y, level.Elevation);
            if (a.DistanceTo(b) < 1e-6)
                throw new RevitCommandException("invalid_parameter", $"Profile segment {i} has zero length.");
            loop.Append(Line.CreateBound(a, b));
        }

        var loops = new List<CurveLoop> { loop };
        var tail = pts.OrderBy(v => v.Z).First();
        Line? arrow = null;
        if (plane.Slope > 1e-12)
        {
            var chord = plane.SlopeChord(pts.Select(v => new FloorPoint(v.X, v.Y, v.Z)).ToList());
            tail = new XYZ(chord.Tail.X, chord.Tail.Y, chord.Tail.Z);
            arrow = Line.CreateBound(new XYZ(tail.X, tail.Y, level.Elevation),
                new XYZ(chord.Head.X, chord.Head.Y, level.Elevation));
        }
        var floor = Floor.Create(doc, loops, floorType.Id, level.Id, structural, arrow!, plane.Slope);
        var offset = floor.get_Parameter(BuiltInParameter.FLOOR_HEIGHTABOVELEVEL_PARAM);
        if (offset == null || offset.IsReadOnly || !offset.Set(tail.Z - level.Elevation))
            throw new RevitCommandException("verification_failed", "Could not preserve floor elevation; creation must roll back.");
        doc.Regenerate();
        var topFaces = HostObjectUtils.GetTopFaces(floor);
        if (topFaces.Count == 0 || topFaces.Any(reference =>
        {
            if (floor.GetGeometryObjectFromReference(reference) is not PlanarFace face) return true;
            var normal = new XYZ(-plane.A, -plane.B, 1).Normalize();
            if (face.FaceNormal.DotProduct(normal) < 1 - 1e-8) return true;
            // Compare every requested boundary vertex with the actual native face plane.
            return pts.Any(v => System.Math.Abs((v - face.Origin).DotProduct(face.FaceNormal)) > FloorProfilePlane.ToleranceFeet);
        }))
            throw new RevitCommandException("verification_failed", "Native floor top face does not match the requested elevations/slope; creation must roll back. No flattened fallback is permitted.");

        return new JsonObject
        {
            ["affected"] = Affected.Created(floor.Id.Value),
            ["id"] = floor.Id.Value,
            ["levelName"] = level.Name,
            ["floorTypeName"] = floorType.Name,
            ["pointCount"] = pts.Count,
            ["structural"] = structural,
            ["slopeRisePerRun"] = plane.Slope,
            ["heightOffsetFeet"] = offset.AsDouble(),
            ["topPlaneVerified"] = true,
        };
    }

    private static FloorType ResolveFloorType(Document doc, string? name)
    {
        var query = new FilteredElementCollector(doc).OfClass(typeof(FloorType)).Cast<FloorType>();
        if (string.IsNullOrWhiteSpace(name))
        {
            return query.FirstOrDefault()
                ?? throw new RevitCommandException("not_found", "No FloorType exists in the document.");
        }
        return query.FirstOrDefault(t => t.Name == name)
            ?? throw new RevitCommandException("not_found", $"FloorType '{name}' not found.");
    }
}

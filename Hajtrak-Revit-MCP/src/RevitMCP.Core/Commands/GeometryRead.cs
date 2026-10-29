using System.Text.Json.Nodes;
using Autodesk.Revit.DB;

namespace RevitMCPAddin.Commands;

/// <summary>Geometry reads shared by individual, linked and structural bulk inspection.</summary>
public static class GeometryRead
{
    public static JsonObject TransformJson(Transform t) => new()
    {
        ["originFeet"] = ReadBack.Xyz(t.Origin), ["basisX"] = ReadBack.Xyz(t.BasisX),
        ["basisY"] = ReadBack.Xyz(t.BasisY), ["basisZ"] = ReadBack.Xyz(t.BasisZ),
        ["determinant"] = t.Determinant, ["hasReflection"] = t.HasReflection,
    };

    public static JsonObject? Box(BoundingBoxXYZ? box, Transform? toHost = null)
    {
        if (box is null) return null;
        var transform = toHost ?? Transform.Identity;
        var points = new List<XYZ>();
        for (int i = 0; i < 8; i++)
            points.Add(transform.OfPoint(box.Transform.OfPoint(new XYZ(
                (i & 1) == 0 ? box.Min.X : box.Max.X,
                (i & 2) == 0 ? box.Min.Y : box.Max.Y,
                (i & 4) == 0 ? box.Min.Z : box.Max.Z))));
        return new JsonObject
        {
            ["min"] = ReadBack.Xyz(new XYZ(points.Min(p => p.X), points.Min(p => p.Y), points.Min(p => p.Z))),
            ["max"] = ReadBack.Xyz(new XYZ(points.Max(p => p.X), points.Max(p => p.Y), points.Max(p => p.Z))),
        };
    }

    public static JsonObject Location(Element element, Transform? toHost = null)
    {
        var t = toHost ?? Transform.Identity;
        var result = new JsonObject { ["units"] = "feet", ["frame"] = toHost is null ? "document-internal" : "host-internal" };
        if (element.Location is LocationCurve lc)
        {
            result["kind"] = "curve";
            result["curveType"] = lc.Curve.GetType().Name;
            if (lc.Curve.IsBound)
            {
                result["start"] = ReadBack.Xyz(t.OfPoint(lc.Curve.GetEndPoint(0)));
                result["end"] = ReadBack.Xyz(t.OfPoint(lc.Curve.GetEndPoint(1)));
                result["lengthFeet"] = lc.Curve.Length;
            }
        }
        else if (element.Location is LocationPoint lp)
        {
            result["kind"] = "point"; result["point"] = ReadBack.Xyz(t.OfPoint(lp.Point));
            result["rotationRadiansInDocument"] = lp.Rotation;
        }
        else result["kind"] = "unavailable";
        if (element is FamilyInstance fi) result["instanceTransformInDocument"] = TransformJson(fi.GetTransform());
        return result;
    }

    public static JsonObject Read(Element element)
    {
        var errors = new JsonArray();
        var result = new JsonObject { ["id"] = element.Id.Value, ["uniqueId"] = element.UniqueId,
            ["name"] = element.Name, ["lengthUnits"] = "feet", ["coordinateFrame"] = "document-internal",
            ["location"] = Location(element), ["errors"] = errors };
        try
        {
            var box = Box(element.get_BoundingBox(null));
            result["boundingBox"] = box;
            if (box is not null)
            {
                var center = (ReadBack.Xyz(box["min"])! + ReadBack.Xyz(box["max"])!) / 2;
                result["centroid"] = ReadBack.Xyz(center); // retained legacy field
                result["boundingBoxCenter"] = ReadBack.Xyz(center);
                result["legacyCentroidMeaning"] = "bounding-box midpoint; use volumeCentroidFeet for solid centroid";
            }
        }
        catch (Exception ex) { errors.Add(new JsonObject { ["stage"] = "boundingBox", ["message"] = ex.Message }); }
        double volume = 0, area = 0;
        var weighted = XYZ.Zero;
        int faces = 0, solids = 0;
        bool centroidComplete = true;
        void Visit(GeometryElement geometry, int depth)
        {
            if (depth > 32) { errors.Add(new JsonObject { ["stage"] = "geometry", ["message"] = "Nested geometry depth exceeds 32." }); return; }
            foreach (var item in geometry)
            {
                try
                {
                    if (item is Solid solid && solid.Volume > 0)
                    {
                        volume += solid.Volume; area += solid.SurfaceArea;
                        faces += solid.Faces.Size; solids++;
                        try { weighted += solid.ComputeCentroid() * solid.Volume; }
                        catch (Exception ex) { centroidComplete = false; errors.Add(new JsonObject { ["stage"] = "centroid", ["message"] = ex.Message }); }
                    }
                    else if (item is GeometryInstance instance) Visit(instance.GetInstanceGeometry(), depth + 1);
                }
                catch (Exception ex) { errors.Add(new JsonObject { ["stage"] = "geometry", ["message"] = ex.Message }); }
            }
        }
        try
        {
            var geometry = element.get_Geometry(new Options { DetailLevel = ViewDetailLevel.Fine });
            if (geometry is not null) Visit(geometry, 0);
        }
        catch (Exception ex) { errors.Add(new JsonObject { ["stage"] = "geometry", ["message"] = ex.Message }); }
        result["solidCount"] = solids; result["faceCount"] = faces;
        result["volumeCubicFeet"] = solids > 0 ? JsonValue.Create(volume) : null;
        result["surfaceAreaSqFeet"] = solids > 0 ? JsonValue.Create(area) : null;
        result["volumeCentroidFeet"] = volume > 0 && centroidComplete ? ReadBack.Xyz(weighted / volume) : null;
        result["geometryStatus"] = errors.Count > 0 ? "partial" : solids > 0 ? "available" : "no-solids";
        result["physicalExtentsMeaning"] = "axis-aligned bounding box; not fabricated end or support verification";
        return result;
    }
}

using System;
using System.Collections.Generic;
using System.Linq;

namespace RevitMCPAddin.Commands;

// Pure geometry in internal feet; deliberately independent of the Revit runtime.
internal readonly record struct FloorPoint(double X, double Y, double Z);
internal readonly record struct FloorProfilePlane(double A, double B, double C)
{
    public double Height(double x, double y) => A * x + B * y + C;
    public double Slope => Math.Sqrt(A * A + B * B);
    public const double ToleranceFeet = 1e-6;

    public (FloorPoint Tail, FloorPoint Head) SlopeChord(IReadOnlyList<FloorPoint> points)
    {
        var dx = A / Slope;
        var dy = B / Slope;
        var origin = points[0];
        double Along(FloorPoint p) => (p.X - origin.X) * dx + (p.Y - origin.Y) * dy;
        double Across(FloorPoint p) => -(p.X - origin.X) * dy + (p.Y - origin.Y) * dx;
        var acrossMin = points.Min(Across);
        var acrossMax = points.Max(Across);
        var cut = (acrossMin + acrossMax) / 2;
        var intersections = new List<double>();
        for (int i = 0; i < points.Count; i++)
        {
            var p = points[i];
            var q = points[(i + 1) % points.Count];
            var u = Across(p);
            var v = Across(q);
            // Half-open crossing test avoids counting a vertex twice.
            if ((u > cut) == (v > cut)) continue;
            intersections.Add(Along(p) + (Along(q) - Along(p)) * (cut - u) / (v - u));
        }
        intersections.Sort();
        double start = 0, end = 0;
        for (int i = 0; i + 1 < intersections.Count; i += 2)
            if (intersections[i + 1] - intersections[i] > end - start)
                (start, end) = (intersections[i], intersections[i + 1]);
        if (end - start < ToleranceFeet)
            throw new RevitCommandException("invalid_parameter", "Cannot find an interior slope arrow for this floor boundary.");
        // Materialize without capturing this record struct in a local function.
        var x0 = origin.X + start * dx - cut * dy;
        var y0 = origin.Y + start * dy + cut * dx;
        var x1 = origin.X + end * dx - cut * dy;
        var y1 = origin.Y + end * dy + cut * dx;
        return (new(x0, y0, Height(x0, y0)), new(x1, y1, Height(x1, y1)));
    }

    public static FloorProfilePlane Fit(IReadOnlyList<FloorPoint> points)
    {
        if (points.Count < 3 || points.Any(p => !double.IsFinite(p.X) || !double.IsFinite(p.Y) || !double.IsFinite(p.Z)))
            throw new RevitCommandException("invalid_parameter", "Floor profile requires at least three finite XYZ points.");
        var origin = points[0];
        // Use the largest XY triangle to avoid an unstable plane from nearly collinear vertices.
        double determinant = 0, a = 0, b = 0;
        for (int i = 1; i < points.Count - 1; i++)
        for (int j = i + 1; j < points.Count; j++)
        {
            var u = new FloorPoint(points[i].X - origin.X, points[i].Y - origin.Y, points[i].Z - origin.Z);
            var v = new FloorPoint(points[j].X - origin.X, points[j].Y - origin.Y, points[j].Z - origin.Z);
            var d = u.X * v.Y - u.Y * v.X;
            if (Math.Abs(d) <= Math.Abs(determinant)) continue;
            determinant = d;
            a = (u.Z * v.Y - u.Y * v.Z) / d;
            b = (u.X * v.Z - u.Z * v.X) / d;
        }
        if (Math.Abs(determinant) < 1e-10)
            throw new RevitCommandException("invalid_parameter", "Floor profile has no usable XY area.");
        var plane = new FloorProfilePlane(a, b, origin.Z - a * origin.X - b * origin.Y);
        if (!double.IsFinite(plane.A) || !double.IsFinite(plane.B) || !double.IsFinite(plane.C) ||
            points.Any(p => Math.Abs(plane.Height(p.X, p.Y) - p.Z) > ToleranceFeet))
            throw new RevitCommandException("invalid_parameter", "Floor profile must lie on one plane. Split a multi-slope ramp into separate floor segments; elevations are never flattened.");
        return plane;
    }
}

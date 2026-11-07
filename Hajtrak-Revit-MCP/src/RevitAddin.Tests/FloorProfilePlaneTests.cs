using RevitMCPAddin.Commands;
using Xunit;

namespace RevitMCPAddin.Tests;

public class FloorProfilePlaneTests
{
    [Theory]
    [InlineData(0, 0, 0)]
    [InlineData(0, 0, 12)]
    [InlineData(1.0 / 23, 0, -1.7)]
    [InlineData(-0.05, 0.025, 4)]
    public void Preserves_horizontal_elevated_and_rotated_ramp_planes(double a, double b, double c)
    {
        FloorPoint Point(double x, double y) => new(x, y, a * x + b * y + c);
        var plane = FloorProfilePlane.Fit(new[] { Point(0, 0), Point(20, 0), Point(20, 5), Point(0, 5) });
        Assert.Equal(a, plane.A, 10);
        Assert.Equal(b, plane.B, 10);
        Assert.Equal(c, plane.C, 10);
        Assert.Equal(a * 7 + b * 2 + c, plane.Height(7, 2), 10);
    }

    [Fact]
    public void Crossfall_arrow_stays_inside_rectangle_and_preserves_rise_run()
    {
        var points = new[] { new FloorPoint(0, 0, 0), new FloorPoint(10, 0, 1),
            new FloorPoint(10, 4, 1.8), new FloorPoint(0, 4, 0.8) };
        var plane = FloorProfilePlane.Fit(points);
        var (tail, head) = plane.SlopeChord(points);
        Assert.InRange(tail.X, -1e-9, 10 + 1e-9);
        Assert.InRange(head.X, -1e-9, 10 + 1e-9);
        Assert.InRange(tail.Y, -1e-9, 4 + 1e-9);
        Assert.InRange(head.Y, -1e-9, 4 + 1e-9);
        var run = System.Math.Sqrt(System.Math.Pow(head.X - tail.X, 2) + System.Math.Pow(head.Y - tail.Y, 2));
        Assert.Equal(plane.Slope, (head.Z - tail.Z) / run, 10);
    }

    [Fact]
    public void Rejects_warped_profile_instead_of_flattening()
        => Assert.Throws<RevitCommandException>(() => FloorProfilePlane.Fit(new[] {
            new FloorPoint(0, 0, 0), new FloorPoint(10, 0, 1),
            new FloorPoint(10, 4, 2), new FloorPoint(0, 4, 0) }));

    [Fact]
    public void Collinear_initial_vertices_do_not_hide_slope()
    {
        var plane = FloorProfilePlane.Fit(new[] { new FloorPoint(0, 0, 0), new FloorPoint(5, 0, 1),
            new FloorPoint(10, 0, 2), new FloorPoint(10, 4, 2), new FloorPoint(0, 4, 0) });
        Assert.Equal(0.2, plane.A, 10);
    }

    [Fact]
    public void Rejects_zero_area_and_nonfinite_profiles()
    {
        Assert.Throws<RevitCommandException>(() => FloorProfilePlane.Fit(new[] {
            new FloorPoint(0, 0, 0), new FloorPoint(1, 0, 0), new FloorPoint(2, 0, 0) }));
        Assert.Throws<RevitCommandException>(() => FloorProfilePlane.Fit(new[] {
            new FloorPoint(0, 0, 0), new FloorPoint(1, 0, double.NaN), new FloorPoint(0, 1, 0) }));
    }
}

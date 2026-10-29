using System.Text.Json.Nodes;
using Autodesk.Revit.DB;
namespace RevitMCPAddin.Commands;
public sealed class GetElementGeometryCommand : IRevitCommand
{
    public string Name => "get_element_geometry";
    public bool IsReadOnly => true;
    public JsonNode? Execute(CommandContext ctx)
    {
        var id = P.Long(ctx.Parameters, "id");
        var element = ctx.RequireDoc().GetElement(new ElementId(id))
            ?? throw new RevitCommandException("not_found", $"Element {id} not found.");
        return GeometryRead.Read(element);
    }
}

using System.Text.Json.Nodes;
using Autodesk.Revit.DB;
namespace RevitMCPAddin.Commands;

public static class ParameterAccess
{
    public static Parameter Resolve(Element element, JsonObject p)
    {
        if (p["parameterId"] is not null)
        {
            var id = P.Long(p, "parameterId");
            return element.Parameters.Cast<Parameter>().SingleOrDefault(x => x.Id.Value == id)
                ?? throw new RevitCommandException("not_found", $"Parameter ID {id} not found on element {element.Id.Value}.");
        }
        var name = P.Str(p, "parameterName");
        var matches = element.GetParameters(name);
        if (matches.Count == 0) throw new RevitCommandException("not_found", $"Parameter '{name}' not found.");
        if (matches.Count != 1) throw new RevitCommandException("invalid_parameter", $"Parameter name '{name}' is ambiguous; supply parameterId.");
        return matches[0];
    }

    public static void Guard(Parameter parameter, JsonNode value, JsonObject p)
    {
        var name = parameter.Definition.Name.Replace(" ", "_");
        if (name is "Comments" or "1.01_MET_Works" or "1.02_MET_Description")
        {
            if (!P.BoolOr(p, "allowProtectedFields", false) && value.ToString().Length > 0)
                throw new RevitCommandException("invalid_parameter", "This review field must remain blank. A task-specific explicit allowProtectedFields override is required to populate it.");
        }
        if (parameter.IsReadOnly) throw new RevitCommandException("read_only_parameter", $"Parameter '{parameter.Definition.Name}' is read-only.");
    }
}

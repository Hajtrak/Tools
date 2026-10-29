using System.Linq;
using System.Text.Json.Nodes;
using Autodesk.Revit.DB;

namespace RevitMCPAddin.Commands;

/// <summary>
/// List user worksets with per-workset element counts.  Flags empty worksets
/// (no instances) and un-renamed defaults ("Workset1").  Read-only.
///
/// Returns { isWorkshared, count, emptyCount, worksets: [...] }.  For a
/// non-workshared model returns isWorkshared=false and an empty list.
/// </summary>
public sealed class GetWorksetsCommand : IRevitCommand
{
    public string Name => "get_worksets";
    public bool IsReadOnly => true;

    public JsonNode? Execute(CommandContext ctx)
    {
        var doc = ctx.RequireDoc();

        if (!doc.IsWorkshared)
            return new JsonObject
            {
                ["isWorkshared"] = false,
                ["count"] = 0,
                ["emptyCount"] = 0,
                ["worksets"] = new JsonArray(),
                ["note"] = "Model is not workshared — no user worksets.",
            };

        var worksets = new FilteredWorksetCollector(doc)
            .OfKind(WorksetKind.UserWorkset)
            .ToWorksets()
            .OrderBy(w => w.Name)
            .ToList();

        var arr = new JsonArray();
        int emptyCount = 0;
        foreach (var ws in worksets)
        {
            // Count instances (not element types) assigned to this workset —
            // that is what "this workset has elements" means to a BIM manager.
            int elementCount = new FilteredElementCollector(doc)
                .WhereElementIsNotElementType()
                .WherePasses(new ElementWorksetFilter(ws.Id))
                .GetElementCount();
            bool isEmpty = elementCount == 0;
            if (isEmpty) emptyCount++;

            string? owner = string.IsNullOrEmpty(ws.Owner) ? null : ws.Owner;

            arr.Add(new JsonObject
            {
                ["id"] = ws.Id.IntegerValue,
                ["name"] = ws.Name,
                ["elementCount"] = elementCount,
                ["isEmpty"] = isEmpty,
                ["isOpen"] = ws.IsOpen,
                ["isEditable"] = ws.IsEditable,
                ["isVisibleByDefault"] = ws.IsVisibleByDefault,
                ["owner"] = P.BoolOr(ctx.Parameters, "includeOwners", false) ? owner : null,
                ["countScope"] = "instances available in current document; closed worksets may be incomplete",
                ["countComplete"] = ws.IsOpen,
                ["isDefaultName"] = ws.Name == "Workset1",
            });
        }

        return new JsonObject
        {
            ["isWorkshared"] = true,
            ["count"] = worksets.Count,
            ["emptyCount"] = emptyCount,
            ["worksets"] = arr,
            ["ownersIncluded"] = P.BoolOr(ctx.Parameters, "includeOwners", false),
            ["countScope"] = "user worksets; current document instances, excludes types",
            ["complete"] = worksets.All(w => w.IsOpen),
        };
    }
}

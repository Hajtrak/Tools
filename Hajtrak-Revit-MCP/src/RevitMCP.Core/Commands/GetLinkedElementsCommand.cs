using System;
using System.Linq;
using System.Text.Json.Nodes;
using Autodesk.Revit.DB;

namespace RevitMCPAddin.Commands;

/// <summary>
/// Read elements that live INSIDE a specific linked RVT file.
/// Bounding boxes are transformed to host-model coordinates.
///
/// Params:
///   - linkId:    long, required — ElementId of the RevitLinkInstance.
///   - category:  string, optional — BuiltInCategory enum name (e.g. "OST_DuctCurves").
///                Omit to retrieve all element types.
///   - limit:     int, optional, default 200, max 2000.
/// </summary>
public sealed class GetLinkedElementsCommand : IRevitCommand
{
    public string Name => "get_linked_elements";
    public bool IsReadOnly => true;

    public JsonNode? Execute(CommandContext ctx)
    {
        var doc = ctx.RequireDoc();
        var p = ctx.Parameters;

        var linkId = new ElementId(P.Long(p, "linkId"));
        var categoryStr = P.StrOrNull(p, "category");
        var limit = Math.Clamp(P.IntOr(p, "limit", 200), 1, 2000);
        var offset = Math.Max(0, P.IntOr(p, "offset", 0));

        var linkInstance = doc.GetElement(linkId) as RevitLinkInstance
            ?? throw new RevitCommandException("not_found",
                $"No RevitLinkInstance with id {linkId.Value}.");

        var linkedDoc = linkInstance.GetLinkDocument()
            ?? throw new RevitCommandException("invalid_parameter",
                $"Linked file '{linkInstance.Name}' is not loaded. Load it in Revit first.");

        var transform = linkInstance.GetTotalTransform();

        FilteredElementCollector collector;
        if (!string.IsNullOrEmpty(categoryStr))
        {
            if (!Enum.TryParse<BuiltInCategory>(categoryStr, ignoreCase: true, out var bic))
                throw new RevitCommandException("invalid_parameter",
                    $"Unknown BuiltInCategory '{categoryStr}'.");
            collector = new FilteredElementCollector(linkedDoc)
                .OfCategory(bic)
                .WhereElementIsNotElementType();
        }
        else
        {
            collector = new FilteredElementCollector(linkedDoc)
                .WhereElementIsNotElementType();
        }

        var arr = new JsonArray();
        var count = 0;

        var allIds = collector.ToElementIds().OrderBy(id => id.Value).ToList();
        foreach (var elementId in allIds.Skip(offset).Take(limit))
        {
            var el = linkedDoc.GetElement(elementId);

            var rawBbox = el.get_BoundingBox(null);
            JsonObject? bboxObj = null;

            if (rawBbox != null)
            {
                bboxObj = GeometryRead.Box(rawBbox, transform);
            }

            arr.Add(new JsonObject
            {
                ["id"] = el.Id.Value,
                // Stable across documents, unlike id — which is numbered per document
                // and therefore meaningless (or worse, wrong) outside this link.
                // Matches the externalId ACC / BIM 360 reports for the same element.
                ["uniqueId"] = el.UniqueId,
                ["linkInstanceUniqueId"] = linkInstance.UniqueId,
                ["locationInHostCoords"] = GeometryRead.Location(el, transform),
                ["name"] = el.Name,
                ["category"] = el.Category?.Name,
                ["categoryEnum"] = el.Category?.BuiltInCategory.ToString(),
                ["typeId"] = el.GetTypeId()?.Value,
                ["bboxInHostCoords"] = bboxObj,
            });
            count++;
        }

        return new JsonObject
        {
            ["linkId"] = linkId.Value,
            ["linkName"] = linkInstance.Name,
            ["linkedDocTitle"] = linkedDoc.Title,
            ["category"] = categoryStr,
            ["count"] = arr.Count,
            ["total"] = allIds.Count,
            ["offset"] = offset,
            ["truncated"] = offset + count < allIds.Count,
            ["hasMore"] = offset + count < allIds.Count,
            ["nextOffset"] = offset + count < allIds.Count ? JsonValue.Create(offset + count) : null,
            ["lengthUnits"] = "feet",
            ["coordinateFrame"] = "host-internal",
            ["transformToHost"] = GeometryRead.TransformJson(transform),
            ["elements"] = arr,
        };
    }
}

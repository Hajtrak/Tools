using System.Collections.Generic;
using System.Text.Json.Nodes;
using Autodesk.Revit.DB;

namespace RevitMCPAddin.Commands;

/// <summary>
/// Swap the type of a single element.
///
/// Params:
///   - id:     long, required — ElementId of the element to change.
///   - typeId: long, required — ElementId of the target type (WallType, FloorType, FamilySymbol, …).
/// </summary>
public sealed class ChangeElementTypeCommand : IRevitCommand, IVerifiableCommand
{
    public string Name => "change_element_type";
    public bool IsReadOnly => false;
    public string RiskLevel => "medium";

    public JsonNode? Execute(CommandContext ctx)
    {
        var doc = ctx.RequireDoc();
        var p = ctx.Parameters;

        var idValue    = P.Long(p, "id");
        var typeIdValue = P.Long(p, "typeId");

        var elemId  = new ElementId(idValue);
        var element = doc.GetElement(elemId)
            ?? throw new RevitCommandException("not_found", $"No element with id {idValue}.");

        var newTypeId = new ElementId(typeIdValue);
        var newType   = doc.GetElement(newTypeId)
            ?? throw new RevitCommandException("not_found", $"No element type with id {typeIdValue}.");

        var oldTypeId   = element.GetTypeId();
        var oldTypeName = doc.GetElement(oldTypeId)?.Name;

        var validTypes = element.GetValidTypes();
        if (!validTypes.Contains(newTypeId))
            throw new RevitCommandException("wrong_element_type",
                $"Type {typeIdValue} ('{newType.Name}') is not compatible with element {idValue}. " +
                "Use revit_list_family_types / revit_list_wall_types to find valid types.");

        var before = PlacementState.Read(element);
        var replacementId = element.ChangeTypeId(newTypeId);
        if (replacementId != ElementId.InvalidElementId) { idValue = replacementId.Value; element = doc.GetElement(replacementId); }
        doc.Regenerate();

        return new JsonObject
        {
            ["id"]          = idValue,
            ["originalId"] = elemId.Value,
            ["placementBefore"] = before,
            ["placementAfter"] = PlacementState.Read(element),
            ["sectionTypeParameters"] = StructuralInspection.Parameters(newType),
            ["reviewRequired"] = "Confirm inherited rotation, justification, offsets, material and physical support relationship; no section properties inferred from type name.",
            ["affected"]    = replacementId == ElementId.InvalidElementId ? Affected.Modified(idValue) : new JsonObject {
                ["created"] = new JsonArray(JsonValue.Create(idValue)), ["modified"] = new JsonArray(), ["deleted"] = new JsonArray(JsonValue.Create(elemId.Value)) },
            ["oldTypeId"]   = oldTypeId.Value,
            ["oldTypeName"] = oldTypeName,
            ["newTypeId"]   = typeIdValue,
            ["newTypeName"] = newType.Name,
            ["changeSummary"] = $"Changed element {idValue} type: '{oldTypeName}' → '{newType.Name}'",
        };
    }
    /// <summary>The element's type id must now be the requested type.</summary>
    public VerifyResult Verify(CommandContext ctx, JsonObject result)
    {
        var doc = ctx.RequireDoc();
        var id = result["id"]!.GetValue<long>();
        var want = P.Long(ctx.Parameters, "typeId");
        var el = doc.GetElement(new ElementId(id));
        if (el is null) return VerifyResult.Fail($"element {id} no longer exists after commit");
        var got = el.GetTypeId().Value;
        var observed = PlacementState.Read(el);
        result["placementAfter"] = observed.DeepClone();
        return got == want ? VerifyResult.Pass("Type identity verified; placement evidence returned for review.", observed) : VerifyResult.Fail($"type: expected id {want}, stored id {got}", observed);
    }
}

using System.Text.Json.Nodes;
using Autodesk.Revit.DB;

namespace RevitMCPAddin.Commands;

/// <summary>
/// Duplicate a family type (FamilySymbol) under a new name.  Set parameters on the
/// new type afterwards with set_parameter (using the returned typeId), which already
/// handles unit conversion.
///
/// Params:
///   - sourceTypeId: long, required — ElementId of the FamilySymbol to copy.
///   - newName:      string, required — name for the new type (must be unique in the family).
///
/// Returns: { typeId, name, familyName }.
/// </summary>
public sealed class DuplicateFamilyTypeCommand : IRevitCommand, IVerifiableCommand
{
    public string Name => "duplicate_family_type";
    public bool IsReadOnly => false;
    public string RiskLevel => "low";

    public JsonNode? Execute(CommandContext ctx)
    {
        var doc = ctx.RequireDoc();
        var p = ctx.Parameters;

        var srcId = new ElementId(P.Long(p, "sourceTypeId"));
        var src = doc.GetElement(srcId) as FamilySymbol
            ?? throw new RevitCommandException("not_found",
                $"Element {srcId.Value} is not a family type (FamilySymbol).");

        var newName = P.Str(p, "newName");

        var dup = src.Duplicate(newName) as FamilySymbol
            ?? throw new RevitCommandException("command_failed",
                "Duplicate did not return a FamilySymbol.");
        var writes = new JsonArray();
        if (p["parameters"] is JsonArray parameters)
            foreach (var entry in parameters)
            {
                var args = entry?.DeepClone() as JsonObject ?? throw new RevitCommandException("invalid_parameter", "Each parameters entry must be an object.");
                args["id"] = dup.Id.Value;
                var context = new CommandContext { App = ctx.App, Doc = doc, Parameters = args, DryRun = ctx.DryRun };
                var command = new SetParameterCommand();
                writes.Add(command.Execute(context));
                doc.Regenerate();
                var verify = command.Verify(context, new JsonObject());
                if (verify.IsFailed) throw new RevitCommandException("verify_failed", verify.Detail ?? "Type parameter verification failed.");
            }

        return new JsonObject
        {
            ["typeId"] = dup.Id.Value,
            ["sourceTypeId"] = src.Id.Value,
            ["affected"] = Affected.Created(dup.Id.Value),
            ["parameterWrites"] = writes,
            ["sectionPropertiesVerified"] = false,
            ["note"] = "Requested parameter values verified; suitability and complete section properties still require engineering-source checks.",
            ["name"] = dup.Name,
            ["familyName"] = dup.FamilyName,
        };
    }
    public VerifyResult Verify(CommandContext ctx, JsonObject result)
    {
        var type = ctx.RequireDoc().GetElement(new ElementId(result["typeId"]!.GetValue<long>())) as FamilySymbol;
        if (type is null || type.Name != P.Str(ctx.Parameters, "newName")) return VerifyResult.Fail("Duplicated type identity not retained.");
        if (ctx.Parameters["parameters"] is JsonArray entries)
            foreach (var entry in entries)
            {
                var args = (JsonObject)entry!.DeepClone(); args["id"] = type.Id.Value;
                var verification = new SetParameterCommand().Verify(new CommandContext { App = ctx.App, Doc = ctx.Doc, Parameters = args }, new JsonObject());
                if (verification.IsFailed) return verification;
            }
        return VerifyResult.Pass();
    }
}

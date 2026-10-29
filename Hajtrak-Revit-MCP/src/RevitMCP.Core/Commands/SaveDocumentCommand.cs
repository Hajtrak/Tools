using System.Text.Json.Nodes;
namespace RevitMCPAddin.Commands;
/// <summary>Ordinary save only; no Save As or synchronisation, and never inside a transaction.</summary>
public sealed class SaveDocumentCommand : IRevitCommand
{
    public string Name => "save_document";
    public bool IsReadOnly => false;
    public ExecutionKind Execution => ExecutionKind.UiAction;
    public string RiskLevel => "medium";
    public JsonNode? Execute(CommandContext ctx)
    {
        var doc = ctx.RequireDoc();
        if (doc.IsReadOnly || doc.IsModifiable || string.IsNullOrWhiteSpace(doc.PathName))
            throw new RevitCommandException("invalid_parameter", "Ordinary save requires a writable, previously saved document with no open transaction. Save As is not performed.");
        doc.Save();
        return new JsonObject { ["documentKey"] = StructuralInspection.DocumentKey(doc), ["pathName"] = doc.PathName,
            ["isModified"] = doc.IsModified, ["isWorkshared"] = doc.IsWorkshared,
            ["saved"] = !doc.IsModified, ["synchronisedWithCentral"] = false };
    }
}

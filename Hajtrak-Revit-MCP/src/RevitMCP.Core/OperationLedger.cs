using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using RevitMCPAddin.Commands;
namespace RevitMCPAddin;

/// <summary>Bounded, journaled deduplication. Unfinished operations after restart remain unknown and cannot be replayed.</summary>
public sealed class OperationLedger
{
    private sealed class Entry
    {
        public required string Fingerprint;
        public string State = "queued";
        public JsonObject? Result;
        public TaskCompletionSource<JsonObject> Completion = new(TaskCreationOptions.RunContinuationsAsynchronously);
    }
    private readonly Dictionary<string, Entry> _entries = new();
    private readonly object _sync = new();
    private readonly string _path;
    private readonly int _capacity;
    public OperationLedger(string path, int capacity = 10000)
    {
        _path = path; _capacity = capacity;
        if (!File.Exists(path)) return;
        // Fail closed on damaged journal: do not silently discard duplicate-prevention history.
        foreach (var line in File.ReadLines(path))
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            var row = JsonNode.Parse(line)!.AsObject();
            var id = row["operationId"]!.GetValue<string>();
            var entry = new Entry { Fingerprint = row["fingerprint"]!.GetValue<string>(),
                State = row["state"]!.GetValue<string>(), Result = row["result"]?.DeepClone() as JsonObject };
            if (entry.State is "queued" or "running") entry.State = "unknown";
            if (entry.Result is not null) entry.Completion.TrySetResult((JsonObject)entry.Result.DeepClone());
            _entries[id] = entry;
        }
    }

    public static string Fingerprint(JsonObject payload)
    {
        JsonNode? Canonical(JsonNode? n) => n switch
        {
            JsonObject o => new JsonObject(o.OrderBy(x => x.Key, StringComparer.Ordinal).Select(x => new KeyValuePair<string, JsonNode?>(x.Key, Canonical(x.Value)))),
            JsonArray a => new JsonArray(a.Select(Canonical).ToArray()), _ => n?.DeepClone(),
        };
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(Canonical(payload)!.ToJsonString())));
    }

    public Task<JsonObject> Submit(string id, JsonObject payload, Func<Task<JsonObject>> execute)
    {
        if (id.Length is < 8 or > 128 || id.Any(c => !char.IsAsciiLetterOrDigit(c) && c is not '-' and not '_'))
            return Task.FromResult(JsonResult.Error("invalid_parameter", "operationId must contain 8–128 ASCII letters/digits, '-' or '_'."));
        Entry entry;
        var fingerprint = Fingerprint(payload);
        lock (_sync)
        {
            if (_entries.TryGetValue(id, out var existing))
            {
                if (existing.Fingerprint != fingerprint) return Task.FromResult(JsonResult.Error("operation_conflict", "operationId already belongs to different input."));
                if (existing.State == "unknown") return Task.FromResult(JsonResult.Error("outcome_unknown", "Operation was interrupted by restart. Reconcile actual model state; it will not be executed again."));
                return existing.Completion.Task;
            }
            if (_entries.Count >= _capacity) return Task.FromResult(JsonResult.Error("overloaded", "Operation journal capacity reached. Archive it only after reconciling outstanding operations."));
            entry = new Entry { Fingerprint = fingerprint };
            Persist(id, entry); // before submission; failure means no execution
            _entries.Add(id, entry);
        }
        _ = Complete(id, entry, execute);
        return entry.Completion.Task;
    }

    private async Task Complete(string id, Entry entry, Func<Task<JsonObject>> execute)
    {
        JsonObject result;
        try { result = await execute().ConfigureAwait(false); }
        catch (Exception ex) { result = JsonResult.Error("outcome_unknown", $"Dispatch interrupted: {ex.Message}"); }
        lock (_sync)
        {
            entry.State = result["committed"]?.GetValue<bool>() == false ? "rolled-back"
                : result["ok"]?.GetValue<bool>() == true ? "completed" : "failed-or-partial";
            result["operationId"] = id;
            entry.Result = (JsonObject)result.DeepClone();
            try { Persist(id, entry); }
            catch (Exception ex)
            {
                entry.State = "unknown";
                result["operationJournalWarning"] = $"Result not durably recorded: {ex.Message}. Reconcile after restart.";
            }
            entry.Completion.TrySetResult(result);
        }
    }

    public void MarkRunning(string? id)
    {
        if (id is null) return;
        lock (_sync) if (_entries.TryGetValue(id, out var e)) { e.State = "running"; Persist(id, e); }
    }

    public JsonObject Status(string id)
    {
        lock (_sync)
        {
            if (!_entries.TryGetValue(id, out var e)) return JsonResult.Error("not_found", "No operation recorded. Absence is not proof that an old connector did not execute it.");
            return JsonResult.Success(new JsonObject { ["operationId"] = id, ["state"] = e.State,
                ["result"] = e.Result?.DeepClone(), ["automaticRetrySafe"] = false });
        }
    }

    private void Persist(string id, Entry e)
    {
        var folder = Path.GetDirectoryName(_path);
        if (!string.IsNullOrEmpty(folder)) Directory.CreateDirectory(folder);
        var row = new JsonObject { ["operationId"] = id, ["fingerprint"] = e.Fingerprint,
            ["state"] = e.State, ["utc"] = DateTime.UtcNow.ToString("O"), ["result"] = e.Result?.DeepClone() };
        var bytes = Encoding.UTF8.GetBytes(row.ToJsonString() + "\n");
        using var stream = new FileStream(_path, FileMode.Append, FileAccess.Write, FileShare.Read, 4096, FileOptions.WriteThrough);
        stream.Write(bytes); stream.Flush(true);
    }
}

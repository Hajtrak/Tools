using System.Text.Json.Nodes;
using RevitMCPAddin;
using RevitMCPAddin.Commands;
using Xunit;
namespace RevitMCPAddin.Tests;

public class OperationLedgerTests
{
    private static string Journal() => Path.Combine(Path.GetTempPath(), "RevitMCP-Custom-Tests", Guid.NewGuid().ToString("N") + ".jsonl");
    [Fact]
    public async Task ConcurrentDuplicateSubmissionsExecuteOnce()
    {
        var ledger = new OperationLedger(Journal());
        var completion = new TaskCompletionSource<JsonObject>();
        int calls = 0;
        Task<JsonObject> Run() { calls++; return completion.Task; }
        var first = ledger.Submit("operation-001", new JsonObject { ["value"] = 1 }, Run);
        var second = ledger.Submit("operation-001", new JsonObject { ["value"] = 1 }, Run);
        Assert.Equal(1, calls);
        completion.SetResult(new JsonObject { ["ok"] = true, ["committed"] = true });
        Assert.True((await first)["ok"]!.GetValue<bool>());
        Assert.True((await second)["ok"]!.GetValue<bool>());
    }
    [Fact]
    public async Task ChangedPayloadCannotReuseOperationId()
    {
        var ledger = new OperationLedger(Journal());
        await ledger.Submit("operation-002", new JsonObject { ["value"] = 1 }, () => Task.FromResult(new JsonObject { ["ok"] = true }));
        var result = await ledger.Submit("operation-002", new JsonObject { ["value"] = 2 }, () => throw new Exception("must not execute"));
        Assert.Equal("operation_conflict", result["error"]!["code"]!.GetValue<string>());
    }
    [Fact]
    public async Task CompletedResultSurvivesRestart()
    {
        var path = Journal();
        await new OperationLedger(path).Submit("operation-003", new JsonObject(), () => Task.FromResult(new JsonObject { ["ok"] = true, ["committed"] = true }));
        var result = await new OperationLedger(path).Submit("operation-003", new JsonObject(), () => throw new Exception("must not execute"));
        Assert.True(result["committed"]!.GetValue<bool>());
    }
    [Fact]
    public async Task InterruptedOperationRemainsUnknownAfterRestart()
    {
        var path = Journal();
        var pending = new TaskCompletionSource<JsonObject>();
        _ = new OperationLedger(path).Submit("operation-004", new JsonObject(), () => pending.Task);
        var result = await new OperationLedger(path).Submit("operation-004", new JsonObject(), () => throw new Exception("must not execute"));
        Assert.Equal("outcome_unknown", result["error"]!["code"]!.GetValue<string>());
    }
    [Fact]
    public async Task CapacityDoesNotEvictDeduplicationHistory()
    {
        var ledger = new OperationLedger(Journal(), 1);
        await ledger.Submit("operation-005", new JsonObject(), () => Task.FromResult(new JsonObject { ["ok"] = true }));
        var result = await ledger.Submit("operation-006", new JsonObject(), () => throw new Exception("must not execute"));
        Assert.Equal("overloaded", result["error"]!["code"]!.GetValue<string>());
    }
    [Fact]
    public void FingerprintIgnoresObjectOrderButPreservesArrayOrder()
    {
        Assert.Equal(OperationLedger.Fingerprint(JsonNode.Parse("{\"b\":2,\"a\":1}")!.AsObject()),
            OperationLedger.Fingerprint(JsonNode.Parse("{\"a\":1,\"b\":2}")!.AsObject()));
        Assert.NotEqual(OperationLedger.Fingerprint(JsonNode.Parse("{\"a\":[1,2]}")!.AsObject()),
            OperationLedger.Fingerprint(JsonNode.Parse("{\"a\":[2,1]}")!.AsObject()));
    }
    [Theory]
    [InlineData("NaN")]
    [InlineData("Infinity")]
    [InlineData("-Infinity")]
    public void NonFiniteNumericStringsAreRejected(string value)
    {
        Assert.Throws<RevitCommandException>(() => P.DblFrom(JsonValue.Create(value)!, "value"));
    }
    [Fact]
    public void UnknownCoordinateUnitsCannotSilentlyBecomeMeters()
    {
        Assert.Throws<RevitCommandException>(() => P.LengthScale("milimeters"));
        Assert.Equal(1.0, P.LengthScale("feet"));
        Assert.Equal(1.0 / 0.3048, P.LengthScale("meters"));
    }
}

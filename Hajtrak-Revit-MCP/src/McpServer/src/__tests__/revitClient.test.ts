/**
 * Unit tests for revitClient.ts.
 *
 * Because AUTH_TOKEN and BASE_URL are evaluated at module-import time,
 * every test that needs different env values must call vi.resetModules()
 * then dynamically import the module so those constants are re-evaluated.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Helper — build a minimal Response-like mock.
function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValueOnce({
    status,
    text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
  } as unknown as Response);
}

// ── envelopeToToolResult ──────────────────────────────────────────────────────

describe('envelopeToToolResult', () => {
  it('returns isError=false and text content for ok response', async () => {
    const { envelopeToToolResult } = await import('../revitClient.js');
    const result = envelopeToToolResult({ ok: true, data: { foo: 'bar' } });
    expect(result.isError).toBe(false);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(true);
  });

  it('returns isError=true for error response', async () => {
    const { envelopeToToolResult } = await import('../revitClient.js');
    const result = envelopeToToolResult({
      ok: false,
      error: { code: 'not_found', message: 'missing' },
    });
    expect(result.isError).toBe(true);
  });
});

// ── callRevit body construction ───────────────────────────────────────────────

describe('callRevit', () => {
  beforeEach(() => {
    vi.stubEnv('REVIT_MCP_AUTH_TOKEN', 'test-token');
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('POST to /mcp with command and params', async () => {
    vi.stubGlobal('fetch', mockFetch({ ok: true }));
    const { callRevit } = await import('../revitClient.js');
    await callRevit('ping', { id: 1 });
    const [url, opts] = vi.mocked(global.fetch).mock.calls[0];
    expect(String(url)).toMatch(/\/mcp$/);
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.command).toBe('ping');
    expect(body.params).toEqual({ id: 1 });
  });

  it('includes dryRun=true in body when requested', async () => {
    vi.stubGlobal('fetch', mockFetch({ ok: true }));
    const { callRevit } = await import('../revitClient.js');
    await callRevit('create_wall', {}, true);
    const [, opts] = vi.mocked(global.fetch).mock.calls[0];
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.dryRun).toBe(true);
  });

  it('omits dryRun from body when false', async () => {
    vi.stubGlobal('fetch', mockFetch({ ok: true }));
    const { callRevit } = await import('../revitClient.js');
    await callRevit('ping', {}, false);
    const [, opts] = vi.mocked(global.fetch).mock.calls[0];
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.dryRun).toBeUndefined();
  });

  it('sends approvalToken beside params, never inside them', async () => {
    vi.stubGlobal('fetch', mockFetch({ ok: true }));
    const { callRevit } = await import('../revitClient.js');
    await callRevit('set_parameter', { id: 7 }, false, 'apv_1');
    const [, opts] = vi.mocked(global.fetch).mock.calls[0];
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.approvalToken).toBe('apv_1');
    expect(body.params).toEqual({ id: 7 });
  });

  it('omits approvalToken when not given', async () => {
    vi.stubGlobal('fetch', mockFetch({ ok: true }));
    const { callRevit } = await import('../revitClient.js');
    await callRevit('set_parameter', { id: 7 }, true);
    const [, opts] = vi.mocked(global.fetch).mock.calls[0];
    const body = JSON.parse((opts as RequestInit).body as string);
    expect('approvalToken' in body).toBe(false);
  });
});

// ── callRevitBatch body construction ──────────────────────────────────────────

describe('callRevitBatch', () => {
  beforeEach(() => {
    vi.stubEnv('REVIT_MCP_AUTH_TOKEN', 'test-token');
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('POST to /mcp/batch with steps and stopOnError', async () => {
    vi.stubGlobal('fetch', mockFetch({ ok: true }));
    const { callRevitBatch } = await import('../revitClient.js');
    await callRevitBatch([{ command: 'ping', params: {} }]);
    const [url, opts] = vi.mocked(global.fetch).mock.calls[0];
    expect(String(url)).toMatch(/\/mcp\/batch$/);
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.steps).toHaveLength(1);
    expect(body.steps[0].command).toBe('ping');
    expect(body.stopOnError).toBe(true);
  });

  it('sends a batch approvalToken at the top level', async () => {
    vi.stubGlobal('fetch', mockFetch({ ok: true }));
    const { callRevitBatch } = await import('../revitClient.js');
    await callRevitBatch([{ command: 'create_level', params: { elevation: 3 } }], true, false, 'apv_2');
    const [, opts] = vi.mocked(global.fetch).mock.calls[0];
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.approvalToken).toBe('apv_2');
    expect(body.steps[0].params).toEqual({ elevation: 3 });
  });

  it('passes stopOnError=false when specified', async () => {
    vi.stubGlobal('fetch', mockFetch({ ok: true }));
    const { callRevitBatch } = await import('../revitClient.js');
    await callRevitBatch([{ command: 'ping' }], false);
    const [, opts] = vi.mocked(global.fetch).mock.calls[0];
    const body = JSON.parse((opts as RequestInit).body as string);
    expect(body.stopOnError).toBe(false);
  });
});

// ── error handling ────────────────────────────────────────────────────────────

describe('postJson error handling', () => {
  beforeEach(() => {
    vi.stubEnv('REVIT_MCP_AUTH_TOKEN', 'test-token');
    vi.resetModules();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('returns bad_response for non-JSON body', async () => {
    vi.stubGlobal('fetch', mockFetch('not json at all', 200));
    const { callRevit } = await import('../revitClient.js');
    const result = await callRevit('ping', {});
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('bad_response');
  });

  it('returns transport_error on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('ECONNREFUSED')));
    const { callRevit } = await import('../revitClient.js');
    const result = await callRevit('ping', {});
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('transport_error');
  });

  it('returns timeout code on AbortError', async () => {
    const err = Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(err));
    const { callRevit } = await import('../revitClient.js');
    const result = await callRevit('ping', {});
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('timeout');
  });
});

// ── auth header ───────────────────────────────────────────────────────────────

describe('auth header', () => {
  afterEach(() => {
    vi.doUnmock('fs');
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('includes Bearer token when REVIT_MCP_AUTH_TOKEN is set', async () => {
    vi.stubEnv('REVIT_MCP_AUTH_TOKEN', 'secret-token-xyz');
    vi.resetModules();
    vi.stubGlobal('fetch', mockFetch({ ok: true }));
    const { callRevit } = await import('../revitClient.js');
    await callRevit('ping', {});
    const [, opts] = vi.mocked(global.fetch).mock.calls[0];
    const headers = (opts as RequestInit).headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer secret-token-xyz');
  });

  it('ignores REVIT_MCP_AUTH=false — auth cannot be disabled (0.8.17)', async () => {
    vi.stubEnv('REVIT_MCP_AUTH', 'false');
    vi.stubEnv('REVIT_MCP_AUTH_TOKEN', 'still-sent-token');
    vi.resetModules();
    vi.stubGlobal('fetch', mockFetch({ ok: true }));
    const { callRevit } = await import('../revitClient.js');
    await callRevit('ping', {});
    const [, opts] = vi.mocked(global.fetch).mock.calls[0];
    const headers = (opts as RequestInit).headers as Record<string, string>;
    expect(headers['authorization']).toBe('Bearer still-sent-token');
  });

  it('always includes content-type header', async () => {
    vi.stubEnv('REVIT_MCP_AUTH_TOKEN', 'test-token');
    vi.resetModules();
    vi.stubGlobal('fetch', mockFetch({ ok: true }));
    const { callRevit } = await import('../revitClient.js');
    await callRevit('ping', {});
    const [, opts] = vi.mocked(global.fetch).mock.calls[0];
    const headers = (opts as RequestInit).headers as Record<string, string>;
    expect(headers['content-type']).toBe('application/json');
  });

  it.runIf(process.platform === 'win32')('finds the token when the launcher omits APPDATA', async () => {
    vi.stubEnv('APPDATA', undefined);
    vi.stubEnv('REVIT_MCP_AUTH_TOKEN', undefined);
    const readFileSync = vi.fn().mockReturnValue('profile-token');
    vi.doMock('fs', () => ({ readFileSync }));
    vi.resetModules();
    const { buildHeaders } = await import('../revitClient.js');

    expect(buildHeaders().authorization).toBe('Bearer profile-token');
    expect(readFileSync).toHaveBeenCalledWith(
      expect.stringMatching(/AppData\\Roaming\\Autodesk\\Revit\\Addins\\\d+\\revit-mcp-token\.txt$/i),
      'utf-8',
    );
  });

  it('retries both in-flight requests when their token rotates', async () => {
    vi.stubEnv('APPDATA', 'C:\\RevitTestProfile');
    vi.stubEnv('REVIT_MCP_AUTH_TOKEN', 'old-token');
    vi.doMock('fs', () => ({ readFileSync: () => 'new-token' }));
    vi.resetModules();
    const fetch = vi.fn(async (_url: string, options: RequestInit) => {
      const headers = options.headers as Record<string, string>;
      const ok = headers.authorization === 'Bearer new-token';
      return {
        status: ok ? 200 : 401,
        text: async () => JSON.stringify(ok ? { ok } : { ok, error: { code: 'unauthorized' } }),
      };
    });
    vi.stubGlobal('fetch', fetch);
    const { callRevit } = await import('../revitClient.js');

    const results = await Promise.all([callRevit('ping', {}), callRevit('ping', {})]);
    expect(results.map(({ ok }) => ok)).toEqual([true, true]);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it('checks the authenticated HTTP endpoint without sending a model command', async () => {
    vi.stubEnv('REVIT_MCP_AUTH_TOKEN', 'test-token');
    vi.stubGlobal('fetch', mockFetch({ ok: true }));
    vi.resetModules();
    const { checkRevitAuthentication } = await import('../revitClient.js');

    expect(await checkRevitAuthentication()).toEqual({ ok: true });
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringMatching(/\/stats$/),
      expect.objectContaining({ method: 'GET', body: undefined }),
    );
  });

  it('identifies the bridge when authentication is rejected', async () => {
    const { BRIDGE_INSTANCE_ID, envelopeToToolResult } = await import('../revitClient.js');
    const result = envelopeToToolResult({
      ok: false,
      error: { code: 'unauthorized', message: 'rejected' },
    });
    expect(JSON.parse(result.content[0].text)).toMatchObject({
      bridgeInstanceId: BRIDGE_INSTANCE_ID,
      error: { code: 'unauthorized' },
    });
  });
});

// ── host clamp ────────────────────────────────────────────────────────────────
+
describe("operation recovery metadata", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); });
  it("sends stable logical operation identity separately from parameters", async () => {
    vi.stubGlobal("fetch", mockFetch({ ok: true, operationId: "operation-123" }));
    vi.resetModules();
    const { callRevit } = await import("../revitClient.js");
    await callRevit("create_beam", { typeId: 1 }, false, undefined, "operation-123");
    const body = JSON.parse(vi.mocked(global.fetch).mock.calls[0][1]!.body as string);
    expect(body.operationId).toBe("operation-123");
    expect(body.params).toEqual({ typeId: 1 });
  });
  it("returns the logical ID and unknown outcome on timeout", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(Object.assign(new Error("timeout"), { name: "AbortError" })));
    vi.resetModules();
    const { callRevit } = await import("../revitClient.js");
    const result = await callRevit("create_beam", {}, false, undefined, "operation-456");
    expect(result.operationId).toBe("operation-456");
    expect(result.outcome).toBe("unknown");
    expect(result.error!.message).toMatch(/before retrying/);
    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1);
  });
  it("does not lose operation identity when the response is not JSON", async () => {
    vi.stubGlobal("fetch", mockFetch("broken response"));
    vi.resetModules();
    const { callRevitBatch } = await import("../revitClient.js");
    const result = await callRevitBatch([{ command: "create_beam", params: {} }], true, false, undefined, "operation-789");
    expect(result.operationId).toBe("operation-789");
    expect(result.outcome).toBe("unknown");
  });
});


describe('REVIT_MCP_HOST loopback clamp', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it('refuses to start when REVIT_MCP_HOST is not loopback', async () => {
    vi.stubEnv('REVIT_MCP_HOST', 'evil.example.com');
    vi.resetModules();
    await expect(import('../revitClient.js')).rejects.toThrow(/not a loopback address/);
  });

  it.each(['127.0.0.1', 'localhost', '::1'])('accepts loopback host %s', async (host) => {
    vi.stubEnv('REVIT_MCP_HOST', host);
    vi.stubEnv('REVIT_MCP_AUTH_TOKEN', 'test-token');
    vi.resetModules();
    await expect(import('../revitClient.js')).resolves.toBeDefined();
  });
});

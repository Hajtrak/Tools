/**
 * Thin HTTP client to the in-Revit MCP addin.  All MCP tools go through here.
 *
 * Auth: reads the auth token from REVIT_MCP_AUTH_TOKEN env var or from the
 * well-known file at %APPDATA%/Autodesk/Revit/Addins/<version>/revit-mcp-token.txt.
 *
 * On 401 responses the client automatically re-reads the token file once (Revit
 * regenerates the token on restart) and retries the request.
 */

import { readFileSync, readdirSync } from "fs";
import { homedir } from "node:os";
import { join } from "path";
import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { traceHeaders } from "./trace.js";

// The addin's HttpListener is hard-bound to http://127.0.0.1:<port>/, so a
// non-loopback REVIT_MCP_HOST can never reach a real addin — the only thing it
// could do is hand the bearer token and the full command stream to whatever is
// listening there, over plaintext HTTP. Refuse to start instead.
const RAW_HOST = process.env.REVIT_MCP_HOST ?? "127.0.0.1";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
if (!LOOPBACK_HOSTS.has(RAW_HOST)) {
  throw new Error(
    `REVIT_MCP_HOST="${RAW_HOST}" is not a loopback address. The Revit addin ` +
    `only listens on 127.0.0.1, so a remote host can never be a real addin. ` +
    `Remove REVIT_MCP_HOST or set it to 127.0.0.1.`,
  );
}
const REVIT_HOST = RAW_HOST === "::1" ? "[::1]" : RAW_HOST;
const REVIT_VERSION = process.env.REVIT_MCP_VERSION ?? "2026";
// Auto-assign port by version: 2026 → 7891, 2027 → 7892, …
// Explicit REVIT_MCP_PORT always wins.
const DEFAULT_PORT = 7891 + (parseInt(REVIT_VERSION, 10) - 2026);
const REVIT_PORT = Number(process.env.REVIT_MCP_PORT ?? String(DEFAULT_PORT));
const BASE = `http://${REVIT_HOST}:${REVIT_PORT}`;
const TIMEOUT_MS = Number(process.env.REVIT_MCP_TIMEOUT_MS ?? "30000");
export const BRIDGE_INSTANCE_ID = randomUUID();
export const REVIT_SESSION_ID_PATTERN = /^[a-f0-9]{32}$/;

interface RevitSession {
  sessionId: string;
  port: number;
  processId: number;
  token: string;
}

// Pin every HTTP request made by a tool, including document checks and recipes.
const selectedSession = new AsyncLocalStorage<RevitSession>();

export interface RevitEnvelope {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string; type?: string };
  // Dry-run responses:
  dryRun?: boolean;
  committed?: boolean;
  // Dry-run of a batch in preview_required mode (a single command carries it in data):
  approvalToken?: string;
  approvalExpiresAt?: string;
  // Batch responses also carry these:
  count?: number;
  hadFailures?: boolean;
  results?: unknown;
  operationId?: string;
  outcome?: string;
  bridgeInstanceId?: string;
}

export interface BatchStep {
  command: string;
  params?: Record<string, unknown>;
}

/** Resolve the auth token: explicit env var, then the addin's token file. */
function resolveAuthToken(): string | undefined {
  const explicit = process.env.REVIT_MCP_AUTH_TOKEN;
  if (explicit) return explicit;

  return readTokenFile();
}

function revitAddinFolders(): string[] {
  const roamingFolders = new Set([process.env.APPDATA]);
  if (process.platform === "win32") {
    roamingFolders.add(join(homedir(), "AppData", "Roaming"));
  }
  return [...roamingFolders].filter((folder): folder is string => Boolean(folder))
    .map(folder => join(folder, "Autodesk", "Revit", "Addins", REVIT_VERSION));
}

/** Read the legacy token for the bridge's configured port. */
function readTokenFile(): string | undefined {
  for (const folder of revitAddinFolders()) {
    const tokenPath = join(folder, "revit-mcp-token.txt");
    try {
      const token = readFileSync(tokenPath, "utf-8").trim();
      if (token) return token;
    } catch {
      // The launcher may omit APPDATA, or Revit may still be starting.
    }
  }
  return undefined;
}

function readSessions(): RevitSession[] {
  const sessions = new Map<string, RevitSession>();
  for (const folder of revitAddinFolders()) {
    const directory = join(folder, "revit-mcp-sessions");
    let files: string[];
    try {
      files = readdirSync(directory);
    } catch {
      continue;
    }
    for (const file of files) {
      const sessionId = file.slice(0, -5);
      if (!file.endsWith(".json") || !REVIT_SESSION_ID_PATTERN.test(sessionId) || sessions.has(sessionId))
        continue;
      try {
        const session = JSON.parse(readFileSync(join(directory, file), "utf8")) as RevitSession;
        if (session.sessionId !== sessionId || !Number.isInteger(session.port) ||
            session.port < 1 || session.port > 65535 || !Number.isInteger(session.processId) ||
            session.processId < 1 || session.processId > 0x7fffffff ||
            typeof session.token !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(session.token))
          continue;
        try {
          process.kill(session.processId, 0);
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === "ESRCH") continue;
        }
        sessions.set(sessionId, session);
      } catch {
        // Revit may shut down while discovery is reading the registration.
      }
    }
  }
  return [...sessions.values()];
}

export async function withRevitSession<T>(sessionId: string | undefined, action: () => Promise<T>) {
  const sessions = readSessions();
  if (sessionId) {
    const match = sessions.find(session => session.sessionId === sessionId);
    if (match) return selectedSession.run(match, action);
    return envelopeToToolResult({ ok: false, error: {
      code: "session_not_found",
      message: "That Revit session has ended or is unavailable. Call revit_ping with listSessions: true to find a current session.",
    } });
  }
  if (sessions.length === 0) return action();
  if (sessions.length === 1 && sessions[0].port === REVIT_PORT)
    return selectedSession.run(sessions[0], action);
  return envelopeToToolResult({ ok: false, error: {
    code: "session_required",
    message: "Select a Revit session explicitly. Call revit_ping with listSessions: true and pass the intended sessionId.",
  } });
}

function baseUrl(): string {
  const session = selectedSession.getStore();
  return session ? `http://127.0.0.1:${session.port}` : BASE;
}

// Mutable — refreshed automatically on 401 (Revit regenerates token on restart).
let _authToken: string | undefined = resolveAuthToken();

export function hasAuthToken(): boolean {
  return (selectedSession.getStore()?.token ?? _authToken) !== undefined;
}

export function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const session = selectedSession.getStore();
  const token = session?.token ?? _authToken;
  if (token) {
    headers["authorization"] = `Bearer ${token}`;
  }
  if (session) headers["x-revit-mcp-session"] = session.sessionId;
  return headers;
}

async function requestJson(
  path: string,
  body: Record<string, unknown> | undefined,
  _retried = false,
  timeoutMs = TIMEOUT_MS,
): Promise<RevitEnvelope> {
  const base = baseUrl();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { ...buildHeaders(), ...traceHeaders() };
    headers["x-request-id"] = randomUUID();
    const res = await fetch(`${base}${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers,
      body: JSON.stringify(body),
      redirect: "error",
      signal: controller.signal,
    });
    const text = await res.text();
    let envelope: RevitEnvelope;
    try {
      envelope = JSON.parse(text) as RevitEnvelope;
    } catch {
      return {
        ok: false,
        operationId: body?.operationId as string | undefined,
        outcome: "unknown",
        error: {
          code: "bad_response",
          message: `Non-JSON response from Revit addin (status ${res.status}): ${text.slice(0, 500)}`,
        },
      };
    }

    // On 401, try refreshing the token from disk once — Revit regenerates it
    // on restart and env-var tokens might be stale.
    if (!selectedSession.getStore() && !_retried && envelope.error?.code === "unauthorized") {
      const fresh = readTokenFile();
      if (fresh && `Bearer ${fresh}` !== headers["authorization"]) {
        _authToken = fresh;
        return requestJson(path, body, true, timeoutMs);
      }
    }

    return envelope;
  } catch (err) {
    const name = (err as { name?: string })?.name;
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      operationId: body?.operationId as string | undefined,
      outcome: "unknown",
      error: {
        code: name === "AbortError" ? "timeout" : "transport_error",
        message: `Failed to reach Revit addin at ${base}: ${message}. Execution outcome is unknown; inspect operation status and model state before retrying.`,
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

// approvalToken (preview_required mode): sent beside dryRun, never inside params — the token is
// bound to the exact params of the dry-run that issued it.
export function callRevit(
  command: string,
  params: Record<string, unknown>,
  dryRun = false,
  approvalToken?: string,
  operationId?: string,
): Promise<RevitEnvelope> {
  const body: Record<string, unknown> = { command, params };
  if (dryRun) body.dryRun = true;
  if (approvalToken) body.approvalToken = approvalToken;
  if (operationId) body.operationId = operationId;
  return requestJson("/mcp", body);
}

export function callRevitBatch(
  steps: BatchStep[],
  stopOnError = true,
  dryRun = false,
  approvalToken?: string,
  operationId?: string,
): Promise<RevitEnvelope> {
  const body: Record<string, unknown> = { stopOnError, steps };
  if (dryRun) body.dryRun = true;
  if (approvalToken) body.approvalToken = approvalToken;
  if (operationId) body.operationId = operationId;
  return requestJson("/mcp/batch", body);
}

/** Check authentication on the HTTP thread, independently of Revit's active model. */
export function checkRevitAuthentication(): Promise<RevitEnvelope> {
  return requestJson("/stats", undefined, false, 5000);
}

/** Common helper to convert a Revit envelope into the MCP tool result shape. */
export function envelopeToToolResult(envelope: RevitEnvelope) {
  const result = envelope.error?.code === "unauthorized"
    ? { ...envelope, bridgeInstanceId: BRIDGE_INSTANCE_ID }
    : envelope;
  const text = JSON.stringify(result, null, 2);
  return {
    content: [{ type: "text" as const, text }],
    isError: !envelope.ok,
  };
}

export interface HealthInfo {
  customProtocol?: string;
  reachable: boolean;
  version?: string;
  authEnabled?: boolean;
  authTokenPresent: boolean;
}

/**
 * Probe the addin's /health endpoint.  Never throws — returns a structured
 * result so callers can log diagnostics without crashing startup.
 */
export async function checkRevitHealth(timeoutMs = 5000): Promise<HealthInfo> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl()}/health`, {
      headers: buildHeaders(),
      redirect: "error",
      signal: ctrl.signal,
    });
    if (!res.ok) {
      return { reachable: false, authTokenPresent: hasAuthToken() };
    }
    const data = (await res.json()) as {
      customProtocol?: string;
      version?: string;
      authEnabled?: boolean;
      sessionId?: string;
    };
    const session = selectedSession.getStore();
    if (session && data.sessionId !== session.sessionId)
      return { reachable: false, authTokenPresent: hasAuthToken() };
    return {
      reachable: true,
      customProtocol: data.customProtocol,
      version: data.version,
      authEnabled: data.authEnabled,
      authTokenPresent: hasAuthToken(),
    };
  } catch {
    return { reachable: false, authTokenPresent: hasAuthToken() };
  } finally {
    clearTimeout(timer);
  }
}

export async function listRevitSessions(): Promise<RevitEnvelope> {
  const sessions = await Promise.all(readSessions().map(session => selectedSession.run(session, async () => {
    if (!(await checkRevitHealth(2000)).reachable) return null;
    if (!(await requestJson("/stats", undefined, false, 2000)).ok) return null;
    const { ok, data } = await requestJson("/mcp", { command: "ping", params: {} }, false, 2000);
    const document = data as { activeDocumentTitle?: string; hasActiveDocument?: boolean } | undefined;
    return {
      sessionId: session.sessionId,
      processId: session.processId,
      port: session.port,
      ...(ok ? {
        activeDocumentTitle: document?.activeDocumentTitle ?? null,
        hasActiveDocument: document?.hasActiveDocument ?? false,
      } : { documentStatus: "unavailable" }),
    };
  })));
  return { ok: true, data: { sessions: sessions.filter(session => session !== null) } };
}

export const REVIT_BASE_URL = BASE;

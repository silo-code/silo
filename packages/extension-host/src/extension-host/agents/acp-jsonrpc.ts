/**
 * A JSON-RPC 2.0 client for the Agent Client Protocol, layered on the
 * piped-stdio transport (`acp-transport.ts` → the `acp_*` Rust commands). The
 * transport delivers/accepts **parsed** messages and already groups streamed
 * text chunks (recon Finding 7); this module adds the parts a client owes an
 * ACP agent:
 *
 * - request/response correlation by `id`;
 * - `session/update` notifications fanned out to a listener;
 * - `session/request_permission` surfaced with a one-shot responder;
 * - **every other agent→client request answered `-32601`** — `fs/*`,
 *   `terminal/*` (declined in phase 1), and unknown vendor methods like
 *   `_auth/status_update`, which must be non-fatal (recon Finding 2).
 *
 * Transport-agnostic on purpose: {@link createAcpClient} takes an
 * {@link AcpTransportLike}, so a test passes an in-memory pair and the real
 * caller passes `createAcpTransport(...)`.
 */

import type { AcpMessage, AcpTransportLike } from "./acp-transport";

/** An Agent Client Protocol content block (prompt input or update payload). */
export interface AcpContentBlock {
  type: string;
  [k: string]: unknown;
}

/** The `update` object inside a `session/update` notification. */
export interface AcpSessionUpdate {
  sessionUpdate: string;
  [k: string]: unknown;
}

export interface AcpPermissionOption {
  optionId: string;
  name: string;
  kind: string;
}

/** One choice inside an {@link AcpConfigOption}. */
export interface AcpConfigChoice {
  value: string;
  name: string;
  description?: string;
}

/**
 * One entry of `session/new`'s `configOptions` list (recon 2026-09-08). The
 * protocol makes it self-describing and it subsumes the older `modes` /
 * `models` fields. Only `type: "select"` is understood; the write path is
 * typed per `category` (`"mode"` → `session/set_mode`, `"model"` →
 * `session/set_model`) because `session/set_config_option` does not work
 * (-32603 on Cursor for every shape probed).
 */
export interface AcpConfigOption {
  id: string;
  name: string;
  description?: string;
  category: string;
  type: string;
  currentValue: string;
  options: AcpConfigChoice[];
}

export interface AcpPermissionRequest {
  toolCallId: string;
  title: string;
  options: AcpPermissionOption[];
  raw: Record<string, unknown>;
}

export type AcpPermissionOutcome =
  | { outcome: "selected"; optionId: string }
  | { outcome: "cancelled" };

export type AcpStopReason =
  | "end_turn"
  | "max_tokens"
  | "max_turn_requests"
  | "refusal"
  | "cancelled";

export interface AcpAgentInfo {
  name?: string;
  title?: string;
  version?: string;
}

export interface AcpInitializeResult {
  protocolVersion?: number;
  agentInfo?: AcpAgentInfo | null;
  agentCapabilities?: { loadSession?: boolean; [k: string]: unknown };
  authMethods?: unknown[];
  raw: Record<string, unknown>;
}

/** A JSON-RPC error returned by the agent — carries the agent's own message,
 *  which is the only place a non-auth `session/new` failure (a vendor
 *  deprecation, say — recon Finding 5) explains itself. */
export class AcpRpcError extends Error {
  readonly code: number;
  readonly data: unknown;
  constructor(err: { code?: number; message?: string; data?: unknown }) {
    super(err.message || `ACP error ${err.code ?? "?"}`);
    this.name = "AcpRpcError";
    this.code = err.code ?? 0;
    this.data = err.data;
  }
}

export interface AcpClientCallbacks {
  /** One `session/update` notification (the inner `update` object). */
  onUpdate(update: AcpSessionUpdate): void;
  /**
   * The agent wants permission. Call `respond` exactly once. If this callback
   * does not respond, the caller is responsible for eventually doing so —
   * `acp-sessions-service.ts` answers `cancelled` when the extension has no
   * listener.
   */
  onPermission(
    request: AcpPermissionRequest,
    respond: (outcome: AcpPermissionOutcome) => void,
  ): void;
  /** The connection closed — cleanly (stdin dropped) or because the agent
   *  died. `err` is set only for an abnormal exit. */
  onClosed(err?: Error): void;
  /** stderr / protocol-violation diagnostics. */
  onLog?(line: string): void;
}

export interface AcpClient {
  /** ACP `initialize`. Declines `fs/*` and `terminal/*` client capabilities
   *  (phase 1 — recon Finding 1: the client is not a safety boundary). */
  initialize(): Promise<AcpInitializeResult>;
  /** ACP `session/new`. Rejects with an {@link AcpRpcError} when the agent
   *  needs auth or reports a business failure. `configOptions` is the parsed
   *  (possibly empty) session-control list. */
  newSession(cwd: string): Promise<{
    sessionId: string;
    configOptions: AcpConfigOption[];
    raw: Record<string, unknown>;
  }>;
  /** ACP `session/load` — replay a prior conversation into a fresh process. */
  loadSession(sessionId: string, cwd: string): Promise<void>;
  /** ACP `session/prompt`. Resolves with the turn's stop reason. */
  prompt(
    sessionId: string,
    blocks: AcpContentBlock[],
  ): Promise<{ stopReason: AcpStopReason }>;
  /** ACP `session/cancel` (a notification — returns immediately). */
  cancel(sessionId: string): void;
  /**
   * ACP `session/set_config_option` — the **generic** setter that pairs with
   * `session/new`'s `configOptions`, and the one to reach for first. Verified
   * on both probed agents (2026-09-08) for every advertised category,
   * including ones with no typed method of their own (`thought_level`).
   *
   * The parameter is **`configId`**, not `optionId` — an earlier probe missed
   * this and concluded the method was broken. Resolves with the agent's
   * updated `configOptions` when it returned them (both agents do), so the
   * caller can replace its snapshot rather than patch it.
   *
   * Rejects `-32601` on an agent that does not implement it; the caller falls
   * back to {@link setMode} / {@link setModel}.
   */
  setConfigOption(
    sessionId: string,
    configId: string,
    value: string,
  ): Promise<AcpConfigOption[] | null>;
  /** ACP `session/set_mode` — fallback for an agent with no generic setter. */
  setMode(sessionId: string, modeId: string): Promise<void>;
  /** ACP `session/set_model` — fallback only. `-32601` on Claude, which
   *  reaches the generic setter instead. */
  setModel(sessionId: string, modelId: string): Promise<void>;
  /** Kill the transport and fail every in-flight request. */
  dispose(): void;
}

const DECLINED_METHOD_PREFIXES = ["fs/", "terminal/"];

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

/**
 * Parse `session/new`'s `configOptions` defensively — every field may be
 * missing or the wrong type. An entry with no `id` or no `options` is dropped;
 * a missing `type` defaults to `"select"` (the only shape the protocol
 * defines today) and a missing `currentValue` falls back to the first option.
 */
export function parseConfigOptions(raw: unknown): AcpConfigOption[] {
  if (!Array.isArray(raw)) return [];
  const out: AcpConfigOption[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    const id = asString(e.id);
    if (!id) continue;
    const rawOptions = Array.isArray(e.options) ? e.options : [];
    const options: AcpConfigChoice[] = [];
    for (const o of rawOptions) {
      if (typeof o !== "object" || o === null) continue;
      const oo = o as Record<string, unknown>;
      const value = asString(oo.value);
      if (value === undefined) continue;
      options.push({
        value,
        name: asString(oo.name) ?? value,
        ...(asString(oo.description)
          ? { description: asString(oo.description) }
          : {}),
      });
    }
    if (options.length === 0) continue;
    out.push({
      id,
      name: asString(e.name) ?? id,
      ...(asString(e.description)
        ? { description: asString(e.description) }
        : {}),
      category: asString(e.category) ?? "",
      type: asString(e.type) ?? "select",
      currentValue: asString(e.currentValue) ?? options[0].value,
      options,
    });
  }
  return out;
}

export function createAcpClient(
  transport: AcpTransportLike,
  cb: AcpClientCallbacks,
): AcpClient {
  let writer: WritableStreamDefaultWriter<AcpMessage> | null = null;
  let connected: Promise<void> | null = null;
  let closed: Error | "clean" | null = null;
  // The transport's last diagnostic — an exit code plus the agent's own stderr
  // tail. It arrives *before* the close event (see `acp-transport.ts`'s
  // `acp_closed` listener), which is what makes it usable as the reason a
  // pending request failed. Without this, an agent that dies during the
  // handshake reports a bare "ACP connection closed" to the user while the
  // sentence explaining why goes only to a debug log — the exact opposite of
  // what stderr capture exists for.
  let lastTransportError: Error | null = null;
  let nextId = 1;
  const pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: unknown) => void }
  >();

  function failAllPending(reason: Error): void {
    for (const { reject } of pending.values()) reject(reason);
    pending.clear();
  }

  function isResponse(msg: AcpMessage): boolean {
    return (
      msg.id !== undefined &&
      msg.method === undefined &&
      ("result" in msg || "error" in msg)
    );
  }

  function handleMessage(msg: AcpMessage): void {
    if (isResponse(msg)) {
      const p = pending.get(msg.id as number);
      if (!p) return;
      pending.delete(msg.id as number);
      if ("error" in msg && msg.error) {
        p.reject(
          new AcpRpcError(
            msg.error as { code?: number; message?: string; data?: unknown },
          ),
        );
      } else {
        p.resolve((msg as { result?: unknown }).result);
      }
      return;
    }

    // A request from the agent (has both `method` and `id`) must be answered.
    if (msg.method !== undefined && msg.id !== undefined) {
      handleServerRequest(msg.method as string, msg.id, msg.params);
      return;
    }

    // A notification (`method`, no `id`).
    if (msg.method === "session/update") {
      const update = (msg.params as { update?: AcpSessionUpdate } | undefined)
        ?.update;
      if (update?.sessionUpdate) cb.onUpdate(update);
    }
    // Every other notification is ignored — safe by spec.
  }

  function respondResult(id: unknown, result: unknown): void {
    void write({ jsonrpc: "2.0", id: id as number, result });
  }

  function respondError(id: unknown, code: number, message: string): void {
    void write({ jsonrpc: "2.0", id: id as number, error: { code, message } });
  }

  function handleServerRequest(
    method: string,
    id: unknown,
    params: unknown,
  ): void {
    if (method === "session/request_permission") {
      const p = (params ?? {}) as Record<string, unknown>;
      const toolCall = (p.toolCall ?? {}) as Record<string, unknown>;
      const rawOptions = Array.isArray(p.options) ? p.options : [];
      const req: AcpPermissionRequest = {
        toolCallId:
          (toolCall.toolCallId as string) ?? (p.toolCallId as string) ?? "",
        title:
          (toolCall.title as string) ??
          (p.title as string) ??
          "The agent is requesting permission.",
        options: rawOptions.map((o) => {
          const opt = (o ?? {}) as Record<string, unknown>;
          return {
            optionId: String(opt.optionId ?? ""),
            name: String(opt.name ?? opt.optionId ?? "Option"),
            kind: String(opt.kind ?? ""),
          };
        }),
        raw: p,
      };
      let answered = false;
      const respond = (outcome: AcpPermissionOutcome) => {
        if (answered) return;
        answered = true;
        respondResult(id, { outcome });
      };
      cb.onPermission(req, respond);
      return;
    }

    // `fs/*` and `terminal/*` are declined in phase 1; anything else is a
    // vendor extension method. Both answer -32601 and the agent carries on
    // (recon Finding 2) — treating either as fatal would break a compliant
    // agent.
    const declined = DECLINED_METHOD_PREFIXES.some((pre) =>
      method.startsWith(pre),
    );
    cb.onLog?.(
      `answered ${method} with -32601 (${declined ? "capability declined in phase 1" : "unknown method"})`,
    );
    respondError(id, -32601, `method not supported: ${method}`);
  }

  async function ensureConnected(): Promise<void> {
    if (closed) {
      throw closed === "clean" ? new Error("ACP connection is closed") : closed;
    }
    if (connected) return connected;
    connected = (async () => {
      transport.onClose?.(() => {
        const reason = lastTransportError ?? new Error("ACP connection closed");
        if (!closed) closed = lastTransportError ?? "clean";
        failAllPending(reason);
        cb.onClosed(lastTransportError ?? undefined);
      });
      transport.onError?.((err) => {
        lastTransportError =
          err instanceof Error ? err : new Error(String(err));
        cb.onLog?.(String(err));
      });
      const stream = await transport.connect();
      writer = stream.writable.getWriter();
      void readLoop(stream.readable);
    })();
    return connected;
  }

  async function readLoop(readable: ReadableStream<AcpMessage>): Promise<void> {
    const reader = readable.getReader();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        try {
          handleMessage(value);
        } catch (err) {
          cb.onLog?.(`error handling message: ${String(err)}`);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async function write(msg: AcpMessage): Promise<void> {
    await ensureConnected();
    if (!writer) throw new Error("ACP connection is not writable");
    await writer.write(msg);
  }

  async function request(method: string, params: unknown): Promise<unknown> {
    await ensureConnected();
    const id = nextId++;
    const result = new Promise<unknown>((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
    try {
      await write({ jsonrpc: "2.0", id, method, params });
    } catch (err) {
      pending.delete(id);
      throw err;
    }
    return result;
  }

  return {
    async initialize() {
      const result = (await request("initialize", {
        protocolVersion: 1,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
        },
        clientInfo: { name: "silo", version: "0.0.0" },
      })) as Record<string, unknown>;
      return {
        protocolVersion: result?.protocolVersion as number | undefined,
        agentInfo: (result?.agentInfo ?? null) as AcpAgentInfo | null,
        agentCapabilities: result?.agentCapabilities as
          | AcpInitializeResult["agentCapabilities"]
          | undefined,
        authMethods: Array.isArray(result?.authMethods)
          ? (result.authMethods as unknown[])
          : [],
        raw: result ?? {},
      };
    },

    async newSession(cwd) {
      const result = (await request("session/new", {
        cwd,
        mcpServers: [],
      })) as Record<string, unknown>;
      const sessionId = result?.sessionId as string | undefined;
      if (!sessionId) {
        throw new Error("session/new returned no sessionId");
      }
      return {
        sessionId,
        configOptions: parseConfigOptions(result?.configOptions),
        raw: result,
      };
    },

    async loadSession(sessionId, cwd) {
      await request("session/load", { sessionId, cwd, mcpServers: [] });
    },

    async prompt(sessionId, blocks) {
      const result = (await request("session/prompt", {
        sessionId,
        prompt: blocks,
      })) as { stopReason?: AcpStopReason };
      return { stopReason: result?.stopReason ?? "end_turn" };
    },

    cancel(sessionId) {
      void write({
        jsonrpc: "2.0",
        method: "session/cancel",
        params: { sessionId },
      }).catch((err) => cb.onLog?.(`cancel failed: ${String(err)}`));
    },

    async setConfigOption(sessionId, configId, value) {
      const result = (await request("session/set_config_option", {
        sessionId,
        configId,
        value,
      })) as Record<string, unknown> | undefined;
      const updated = parseConfigOptions(result?.configOptions);
      return updated.length > 0 ? updated : null;
    },

    async setMode(sessionId, modeId) {
      await request("session/set_mode", { sessionId, modeId });
    },

    async setModel(sessionId, modelId) {
      await request("session/set_model", { sessionId, modelId });
    },

    dispose() {
      if (!closed) closed = "clean";
      failAllPending(new Error("ACP client disposed"));
      try {
        transport.disconnect();
      } catch {
        /* already gone */
      }
      void writer?.close().catch(() => {});
      writer = null;
    },
  };
}

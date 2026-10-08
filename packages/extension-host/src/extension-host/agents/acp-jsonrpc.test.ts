import { describe, it, expect, vi } from "vitest";
import type { AcpMessage, AcpTransportLike } from "./acp-transport";
import {
  AIR_CLIENT_META,
  capabilityEnabled,
  createAcpClient,
  parseConfigOptions,
  parseSessionInfos,
  AcpRpcError,
  type AcpClientCallbacks,
} from "./acp-jsonrpc";

/** An in-memory {@link AcpTransportLike}: `emit` pushes a frame inbound, `sent`
 *  captures everything the client writes, `close` fires the close handlers. */
function fakeTransport() {
  const sent: AcpMessage[] = [];
  let ctrl!: ReadableStreamDefaultController<AcpMessage>;
  const closeHandlers = new Set<() => void>();
  const errorHandlers = new Set<(e: Error) => void>();
  const readable = new ReadableStream<AcpMessage>({
    start(c) {
      ctrl = c;
    },
  });
  const writable = new WritableStream<AcpMessage>({
    write(m) {
      sent.push(m);
    },
  });
  const transport: AcpTransportLike = {
    connect: () => Promise.resolve({ readable, writable }),
    disconnect: vi.fn(),
    onClose: (h) => {
      closeHandlers.add(h);
      return () => closeHandlers.delete(h);
    },
    onError: (h) => {
      errorHandlers.add(h);
      return () => errorHandlers.delete(h);
    },
  };
  return {
    transport,
    sent,
    emit: (m: AcpMessage) => ctrl.enqueue(m),
    close: () => closeHandlers.forEach((h) => h()),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

function noopCallbacks(
  over: Partial<AcpClientCallbacks> = {},
): AcpClientCallbacks {
  return {
    onUpdate: vi.fn(),
    onPermission: vi.fn(),
    onClosed: vi.fn(),
    onLog: vi.fn(),
    ...over,
  };
}

describe("createAcpClient", () => {
  it("initialize correlates the response and normalizes the result", async () => {
    const t = fakeTransport();
    const client = createAcpClient(t.transport, noopCallbacks());

    const p = client.initialize();
    await flush();
    expect(t.sent[0]).toMatchObject({ id: 1, method: "initialize" });
    // client declines fs / terminal capabilities in phase 1
    expect(t.sent[0].params).toMatchObject({
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
    });

    t.emit({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: 1,
        agentInfo: { title: "Claude Code" },
        agentCapabilities: { loadSession: true },
      },
    });
    const init = await p;
    expect(init.agentInfo).toEqual({ title: "Claude Code" });
    expect(init.agentCapabilities?.loadSession).toBe(true);
  });

  it("answers unknown vendor methods with -32601 (non-fatal)", async () => {
    const t = fakeTransport();
    const client = createAcpClient(t.transport, noopCallbacks());
    void client.initialize();
    await flush();

    t.emit({
      jsonrpc: "2.0",
      id: 7,
      method: "_auth/status_update",
      params: {},
    });
    await flush();
    expect(t.sent).toContainEqual(
      expect.objectContaining({
        id: 7,
        error: expect.objectContaining({ code: -32601 }),
      }),
    );
  });

  it("declines fs/* client methods with -32601", async () => {
    const t = fakeTransport();
    const client = createAcpClient(t.transport, noopCallbacks());
    void client.initialize();
    await flush();

    t.emit({
      jsonrpc: "2.0",
      id: 8,
      method: "fs/write_text_file",
      params: { path: "/x", content: "y" },
    });
    await flush();
    expect(t.sent).toContainEqual(
      expect.objectContaining({
        id: 8,
        error: expect.objectContaining({ code: -32601 }),
      }),
    );
  });

  it("surfaces session/request_permission and answers with the chosen option", async () => {
    const onPermission = vi.fn(
      (
        _req: unknown,
        respond: (o: { outcome: "selected"; optionId: string }) => void,
      ) => respond({ outcome: "selected", optionId: "allow" }),
    );
    const t = fakeTransport();
    const client = createAcpClient(
      t.transport,
      noopCallbacks({
        onPermission:
          onPermission as unknown as AcpClientCallbacks["onPermission"],
      }),
    );
    void client.initialize();
    await flush();

    t.emit({
      jsonrpc: "2.0",
      id: 3,
      method: "session/request_permission",
      params: {
        sessionId: "s1",
        toolCall: { toolCallId: "tc1", title: "Write hello.txt" },
        options: [
          { optionId: "allow", name: "Allow", kind: "allow_once" },
          { optionId: "reject", name: "Reject", kind: "reject_once" },
        ],
      },
    });
    await flush();
    expect(onPermission).toHaveBeenCalledWith(
      expect.objectContaining({ toolCallId: "tc1", title: "Write hello.txt" }),
      expect.any(Function),
    );
    expect(t.sent).toContainEqual(
      expect.objectContaining({
        id: 3,
        result: { outcome: { outcome: "selected", optionId: "allow" } },
      }),
    );
  });

  it("fans session/update notifications out to onUpdate", async () => {
    const onUpdate = vi.fn();
    const t = fakeTransport();
    const client = createAcpClient(t.transport, noopCallbacks({ onUpdate }));
    void client.initialize();
    await flush();

    t.emit({
      jsonrpc: "2.0",
      method: "session/update",
      params: {
        sessionId: "s1",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { text: "hi" },
        },
      },
    });
    await flush();
    expect(onUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ sessionUpdate: "agent_message_chunk" }),
      "s1",
    );
  });

  // RFC 0057 R1. Until Silo advertised the subagent capability every
  // notification belonged to the one session that had been prompted, so this
  // layer dropped the id. A subagent's frames arrive on a child session id,
  // and routing them is the sessions service's job — but it can only do it if
  // the id survives the transport.
  describe("session id delivery", () => {
    const emitUpdate = async (params: Record<string, unknown>) => {
      const onUpdate = vi.fn();
      const t = fakeTransport();
      const client = createAcpClient(t.transport, noopCallbacks({ onUpdate }));
      void client.initialize();
      await flush();
      t.emit({ jsonrpc: "2.0", method: "session/update", params });
      await flush();
      return onUpdate;
    };

    const anUpdate = { sessionUpdate: "agent_message_chunk", content: {} };

    it("delivers a child session's id alongside the update", async () => {
      const onUpdate = await emitUpdate({
        sessionId: "a26fef4c40ae0ac1d",
        update: anUpdate,
      });
      expect(onUpdate.mock.calls[0]?.[1]).toBe("a26fef4c40ae0ac1d");
    });

    it("delivers no session id when the wire carried none", async () => {
      // Every agent before this change, and most still: its frames must keep
      // working, read as the connection's own.
      const onUpdate = await emitUpdate({ update: anUpdate });
      expect(onUpdate).toHaveBeenCalledTimes(1);
      expect(onUpdate.mock.calls[0]?.[1]).toBeUndefined();
    });

    it("reads a non-string session id as absent rather than throwing", async () => {
      for (const sessionId of [7, null, {}, ["s1"]]) {
        const onUpdate = await emitUpdate({ sessionId, update: anUpdate });
        expect(onUpdate).toHaveBeenCalledTimes(1);
        expect(onUpdate.mock.calls[0]?.[1]).toBeUndefined();
      }
    });

    it("still ignores a notification with no usable sessionUpdate", async () => {
      const onUpdate = await emitUpdate({ sessionId: "s1", update: {} });
      expect(onUpdate).not.toHaveBeenCalled();
    });
  });

  // RFC 0057 R7. The one place Silo asks an agent to *change what it sends*,
  // so the opt-in is asserted rather than trusted: a silently-failed opt-in is
  // indistinguishable from capability-off.
  //
  // The first version of this suite asserted the *shape* of the AIR block and
  // passed while the feature was completely dead, because the block was sent
  // beside `clientCapabilities` instead of inside it. So the gate below takes
  // what the adapter takes — the whole `clientCapabilities` object — and does
  // its own `._meta` lookup, exactly as `air-extension.js` does. A test that
  // cannot fail on placement is not testing the opt-in.
  describe("AIR subagent capability opt-in", () => {
    /**
     * `clientSupportsAirCapability` from `claude-agent-acp`'s
     * `air-extension.js`, re-implemented against the pinned 0.75.1 dist.
     *
     * Takes the **`clientCapabilities` object**, not the `_meta` inside it:
     * that indirection is the whole point, since it is where the original bug
     * lived. Accepts only an integer `version >= 1` and an array
     * `capabilities` naming the extension.
     */
    const adapterAccepts = (
      clientCapabilities: unknown,
      name: string,
    ): boolean => {
      const asRecord = (v: unknown): Record<string, unknown> =>
        v && typeof v === "object" && !Array.isArray(v)
          ? (v as Record<string, unknown>)
          : {};
      const air = asRecord(
        asRecord(asRecord(clientCapabilities)._meta).jetbrains,
      ).air;
      if (typeof air !== "object" || air === null || Array.isArray(air))
        return false;
      const { version, capabilities } = air as {
        version?: unknown;
        capabilities?: unknown;
      };
      if (typeof version !== "number" || !Number.isFinite(version))
        return false;
      if (!Number.isInteger(version) || version < 1) return false;
      return Array.isArray(capabilities) && capabilities.includes(name);
    };

    /** The `clientCapabilities` Silo actually puts on the wire. */
    const sentCapabilities = async (): Promise<unknown> => {
      const t = fakeTransport();
      const client = createAcpClient(t.transport, noopCallbacks());
      void client.initialize();
      await flush();
      const init = t.sent.find((m) => m.method === "initialize");
      return (init?.params as { clientCapabilities?: unknown })
        ?.clientCapabilities;
    };

    it("sanity-checks the gate against a block in the wrong place", () => {
      // Guards the guard: if `adapterAccepts` ignored placement it would
      // accept this, and the suite would go back to proving nothing.
      expect(
        adapterAccepts({ _meta: AIR_CLIENT_META }, "nativeSubagentSessions"),
      ).toBe(true);
      expect(adapterAccepts(AIR_CLIENT_META, "nativeSubagentSessions")).toBe(
        false,
      );
    });

    it("advertises inside initialize's clientCapabilities", async () => {
      // Where the adapter reads it from, and the only place it reads it from.
      expect(
        adapterAccepts(await sentCapabilities(), "nativeSubagentSessions"),
      ).toBe(true);
    });

    it("survives the SDK's own clientCapabilities schema", async () => {
      // `zClientCapabilities` is a plain `z.object`, so it strips unknown keys
      // — which is why the canonical `subagents` opt-in never arrived. `_meta`
      // is a declared passthrough field, so the block rides in under it. This
      // models that stripping: everything the schema doesn't name is dropped.
      const declared = new Set([
        "fs",
        "terminal",
        "session",
        "plan",
        "auth",
        "elicitation",
        "nes",
        "positionEncodings",
        "_meta",
      ]);
      const sent = (await sentCapabilities()) as Record<string, unknown>;
      const stripped = Object.fromEntries(
        Object.entries(sent).filter(([k]) => declared.has(k)),
      );
      expect(adapterAccepts(stripped, "nativeSubagentSessions")).toBe(true);
    });

    it("does not advertise asyncTasks", async () => {
      // The out-of-scope sibling (backgrounded shells): advertising it would
      // put `async_task_*` frames on the stream for no reader.
      expect(adapterAccepts(await sentCapabilities(), "asyncTasks")).toBe(
        false,
      );
    });

    it("does not put the block on session/new, where nothing reads it", async () => {
      // The adapter gates subagents on `initialize`'s capabilities alone;
      // `session/new`'s `_meta` is only ever read for
      // `claudeCode.options.resume`. A block there was cargo-cult.
      const t = fakeTransport();
      const client = createAcpClient(t.transport, noopCallbacks());
      void client.initialize();
      await flush();
      t.emit({ jsonrpc: "2.0", id: 1, result: {} });
      void client.newSession("/tmp");
      await flush();
      const neu = t.sent.find((m) => m.method === "session/new");
      expect((neu?.params as { _meta?: unknown })?._meta).toBeUndefined();
    });
  });

  it("prompt resolves with the turn's stop reason", async () => {
    const t = fakeTransport();
    const client = createAcpClient(t.transport, noopCallbacks());
    void client.initialize();
    await flush();
    t.emit({ jsonrpc: "2.0", id: 1, result: {} });

    const p = client.prompt("s1", [{ type: "text", text: "go" }]);
    await flush();
    const req = t.sent.find((m) => m.method === "session/prompt");
    expect(req).toMatchObject({
      params: { sessionId: "s1", prompt: [{ type: "text", text: "go" }] },
    });
    t.emit({
      jsonrpc: "2.0",
      id: req!.id as number,
      result: { stopReason: "end_turn" },
    });
    expect(await p).toEqual({ stopReason: "end_turn" });
  });

  it("a closed connection rejects in-flight requests and calls onClosed", async () => {
    const onClosed = vi.fn();
    const t = fakeTransport();
    const client = createAcpClient(t.transport, noopCallbacks({ onClosed }));
    const p = client.initialize();
    await flush();
    t.close();
    await expect(p).rejects.toThrow();
    expect(onClosed).toHaveBeenCalled();
  });

  it("session/new parses configOptions off the result", async () => {
    const t = fakeTransport();
    const client = createAcpClient(t.transport, noopCallbacks());
    const p = client.newSession("/ws");
    await flush();
    const id = t.sent.find((m) => m.method === "session/new")!.id as number;
    t.emit({
      jsonrpc: "2.0",
      id,
      result: {
        sessionId: "s1",
        configOptions: [
          {
            id: "mode",
            name: "Mode",
            category: "mode",
            type: "select",
            currentValue: "agent",
            options: [{ value: "agent", name: "Agent" }],
          },
        ],
      },
    });
    const { sessionId, configOptions } = await p;
    expect(sessionId).toBe("s1");
    expect(configOptions).toEqual([
      {
        id: "mode",
        name: "Mode",
        category: "mode",
        type: "select",
        currentValue: "agent",
        options: [{ value: "agent", name: "Agent" }],
      },
    ]);
  });

  it("initialize offers protocolVersion 2 and parses sessionCapabilities", async () => {
    const t = fakeTransport();
    const client = createAcpClient(t.transport, noopCallbacks());
    const p = client.initialize();
    await flush();
    expect(t.sent[0]).toMatchObject({
      method: "initialize",
      params: { protocolVersion: 2 },
    });
    t.emit({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: 1,
        agentCapabilities: { loadSession: true },
        sessionCapabilities: { resume: true, close: true, list: true },
      },
    });
    const init = await p;
    expect(init.protocolVersion).toBe(1);
    expect(init.sessionCapabilities?.resume).toBe(true);
    expect(init.sessionCapabilities?.close).toBe(true);
  });

  it("initialize falls back to agentCapabilities.sessionCapabilities when nested there", async () => {
    const t = fakeTransport();
    const client = createAcpClient(t.transport, noopCallbacks());
    const p = client.initialize();
    await flush();
    t.emit({
      jsonrpc: "2.0",
      id: 1,
      result: {
        agentCapabilities: {
          loadSession: true,
          sessionCapabilities: { resume: true },
        },
      },
    });
    const init = await p;
    expect(init.sessionCapabilities?.resume).toBe(true);
  });

  it("loadSession sends sessionId/cwd/mcpServers and adopts a returned sessionId", async () => {
    const t = fakeTransport();
    const client = createAcpClient(t.transport, noopCallbacks());
    const p = client.loadSession("old-id", "/ws");
    await flush();
    const req = t.sent.find((m) => m.method === "session/load");
    expect(req).toMatchObject({
      params: { sessionId: "old-id", cwd: "/ws", mcpServers: [] },
    });
    t.emit({
      jsonrpc: "2.0",
      id: req!.id as number,
      result: { sessionId: "new-id", configOptions: [] },
    });
    const result = await p;
    expect(result.sessionId).toBe("new-id");
  });

  it("loadSession falls back to the requested sessionId when the agent returns none", async () => {
    const t = fakeTransport();
    const client = createAcpClient(t.transport, noopCallbacks());
    const p = client.loadSession("old-id", "/ws");
    await flush();
    const req = t.sent.find((m) => m.method === "session/load");
    t.emit({ jsonrpc: "2.0", id: req!.id as number, result: {} });
    const result = await p;
    expect(result.sessionId).toBe("old-id");
  });

  it("resumeSession sends sessionId/cwd/mcpServers and never returns a new id (no replay)", async () => {
    const t = fakeTransport();
    const client = createAcpClient(t.transport, noopCallbacks());
    const p = client.resumeSession("s1", "/ws");
    await flush();
    const req = t.sent.find((m) => m.method === "session/resume");
    expect(req).toMatchObject({
      params: { sessionId: "s1", cwd: "/ws", mcpServers: [] },
    });
    t.emit({ jsonrpc: "2.0", id: req!.id as number, result: {} });
    await expect(p).resolves.toEqual({ configOptions: [] });
  });

  it("closeSession sends sessionId and resolves on the agent's empty response", async () => {
    const t = fakeTransport();
    const client = createAcpClient(t.transport, noopCallbacks());
    const p = client.closeSession("s1");
    await flush();
    const req = t.sent.find((m) => m.method === "session/close");
    expect(req).toMatchObject({ params: { sessionId: "s1" } });
    t.emit({ jsonrpc: "2.0", id: req!.id as number, result: {} });
    await expect(p).resolves.toBeUndefined();
  });

  it("listSessions sends session/list and parses the agent's sessions array", async () => {
    const t = fakeTransport();
    const client = createAcpClient(t.transport, noopCallbacks());
    const p = client.listSessions();
    await flush();
    const req = t.sent.find((m) => m.method === "session/list");
    expect(req).toMatchObject({ params: {} });
    t.emit({
      jsonrpc: "2.0",
      id: req!.id as number,
      result: {
        sessions: [
          { sessionId: "s1", cwd: "/ws", title: "Fix the bug" },
          { sessionId: "s2" },
        ],
      },
    });
    expect(await p).toEqual({
      sessions: [
        { sessionId: "s1", cwd: "/ws", title: "Fix the bug" },
        { sessionId: "s2" },
      ],
    });
  });

  it("listSessions resolves an empty list when the agent sends nothing", async () => {
    const t = fakeTransport();
    const client = createAcpClient(t.transport, noopCallbacks());
    const p = client.listSessions();
    await flush();
    const req = t.sent.find((m) => m.method === "session/list");
    t.emit({ jsonrpc: "2.0", id: req!.id as number, result: {} });
    expect(await p).toEqual({ sessions: [] });
  });

  // The parameter is `configId`, not `optionId` — an earlier probe passed the
  // wrong name, read the resulting -32602 as "the method is broken", and sent
  // the design down the typed-write path. Pinned so it cannot drift back.
  it("setConfigOption sends configId and returns the agent's updated list", async () => {
    const t = fakeTransport();
    const client = createAcpClient(t.transport, noopCallbacks());
    const p = client.setConfigOption("s1", "effort", "high");
    await flush();
    const req = t.sent.find((m) => m.method === "session/set_config_option");
    expect(req).toMatchObject({
      params: { sessionId: "s1", configId: "effort", value: "high" },
    });
    t.emit({
      jsonrpc: "2.0",
      id: req!.id as number,
      result: {
        configOptions: [
          {
            id: "effort",
            name: "Effort",
            category: "thought_level",
            type: "select",
            currentValue: "high",
            options: [{ value: "high", name: "High" }],
          },
        ],
      },
    });
    expect(await p).toEqual([
      {
        id: "effort",
        name: "Effort",
        category: "thought_level",
        type: "select",
        currentValue: "high",
        options: [{ value: "high", name: "High" }],
      },
    ]);
  });

  it("setConfigOption resolves null when the agent echoes nothing back", async () => {
    const t = fakeTransport();
    const client = createAcpClient(t.transport, noopCallbacks());
    const p = client.setConfigOption("s1", "mode", "plan");
    await flush();
    const req = t.sent.find((m) => m.method === "session/set_config_option");
    t.emit({ jsonrpc: "2.0", id: req!.id as number, result: {} });
    expect(await p).toBeNull();
  });

  it("setMode / setModel send the typed set_* requests", async () => {
    const t = fakeTransport();
    const client = createAcpClient(t.transport, noopCallbacks());
    void client.initialize();
    await flush();
    t.emit({ jsonrpc: "2.0", id: 1, result: {} });

    void client.setMode("s1", "plan");
    void client.setModel("s1", "opus");
    await flush();
    expect(t.sent).toContainEqual(
      expect.objectContaining({
        method: "session/set_mode",
        params: { sessionId: "s1", modeId: "plan" },
      }),
    );
    expect(t.sent).toContainEqual(
      expect.objectContaining({
        method: "session/set_model",
        params: { sessionId: "s1", modelId: "opus" },
      }),
    );
  });

  it("rejects an agent error response as an AcpRpcError carrying its message", async () => {
    const t = fakeTransport();
    const client = createAcpClient(t.transport, noopCallbacks());
    const p = client.newSession("/ws");
    await flush();
    const id = t.sent.find((m) => m.method === "session/new")!.id as number;
    t.emit({
      jsonrpc: "2.0",
      id,
      error: { code: -32000, message: "This client is no longer supported" },
    });
    await expect(p).rejects.toMatchObject({
      name: "AcpRpcError",
      code: -32000,
      message: "This client is no longer supported",
    });
    expect(new AcpRpcError({ message: "x" })).toBeInstanceOf(Error);
  });
});

describe("parseConfigOptions", () => {
  it("returns [] for a missing or non-array value", () => {
    expect(parseConfigOptions(undefined)).toEqual([]);
    expect(parseConfigOptions({})).toEqual([]);
  });

  it("drops an entry with no id or no options, and fills defaults", () => {
    const parsed = parseConfigOptions([
      { name: "no id", options: [{ value: "a", name: "A" }] },
      { id: "empty", options: [] },
      {
        id: "mode",
        options: [
          { value: "agent", name: "Agent", description: "default" },
          { value: "plan" },
        ],
      },
    ]);
    expect(parsed).toEqual([
      {
        id: "mode",
        name: "mode",
        category: "",
        type: "select",
        currentValue: "agent",
        options: [
          { value: "agent", name: "Agent", description: "default" },
          { value: "plan", name: "plan" },
        ],
      },
    ]);
  });
});

describe("parseSessionInfos", () => {
  it("returns [] for a missing or non-array value", () => {
    expect(parseSessionInfos(undefined)).toEqual([]);
    expect(parseSessionInfos({})).toEqual([]);
  });

  it("drops an entry with no sessionId and keeps one with only sessionId", () => {
    const parsed = parseSessionInfos([
      { cwd: "/ws", title: "no id" },
      { sessionId: "s1" },
    ]);
    expect(parsed).toEqual([{ sessionId: "s1" }]);
  });

  it("coerces non-string optional fields to absent rather than throwing", () => {
    const parsed = parseSessionInfos([
      { sessionId: "s1", cwd: 42, title: null, updatedAt: {} },
    ]);
    expect(parsed).toEqual([{ sessionId: "s1" }]);
  });

  it("preserves unknown vendor fields via the index signature", () => {
    const parsed = parseSessionInfos([{ sessionId: "s1", vendorFlag: true }]);
    expect(parsed).toEqual([{ sessionId: "s1", vendorFlag: true }]);
  });
});

// Probed against a live `claude-agent-acp` 0.75.1 outside the app (2026-09-10):
// it advertises `sessionCapabilities: { resume: {}, close: {}, list: {}, … }`
// nested under `agentCapabilities` — details objects, not booleans. Reading
// those with `=== true` meant Silo never once attempted `session/resume`
// against the catalog's most-used agent and always fell through to
// `session/load`, which that adapter implements as a fork.
describe("capabilityEnabled — both shapes an agent advertises", () => {
  it("accepts a details object, the shape claude actually sends", () => {
    expect(capabilityEnabled({})).toBe(true);
    expect(capabilityEnabled({ maxSessions: 4 })).toBe(true);
  });

  it("accepts a bare boolean true", () => {
    expect(capabilityEnabled(true)).toBe(true);
  });

  it("rejects absence and explicit false", () => {
    expect(capabilityEnabled(undefined)).toBe(false);
    expect(capabilityEnabled(null)).toBe(false);
    expect(capabilityEnabled(false)).toBe(false);
  });

  it("rejects shapes that are not a capability at all", () => {
    expect(capabilityEnabled([])).toBe(false);
    expect(capabilityEnabled("resume")).toBe(false);
    expect(capabilityEnabled(0)).toBe(false);
  });
});

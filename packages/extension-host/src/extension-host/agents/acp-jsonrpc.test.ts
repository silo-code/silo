import { describe, it, expect, vi } from "vitest";
import type { AcpMessage, AcpTransportLike } from "./acp-transport";
import {
  createAcpClient,
  parseConfigOptions,
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
    );
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

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AcpClientCallbacks } from "./acp-jsonrpc";

// --- mock the JSON-RPC client + transport ---------------------------------
const fakeClient = {
  initialize: vi.fn(),
  newSession: vi.fn(),
  loadSession: vi.fn(),
  resumeSession: vi.fn(),
  closeSession: vi.fn(),
  prompt: vi.fn(),
  cancel: vi.fn(),
  setConfigOption: vi.fn(),
  setMode: vi.fn(),
  setModel: vi.fn(),
  dispose: vi.fn(),
};
let captured: AcpClientCallbacks;

const transportCalls: Record<string, unknown>[] = [];
vi.mock("./acp-transport", () => ({
  createAcpTransport: vi.fn((opts: Record<string, unknown>) => {
    transportCalls.push(opts);
    // The spawn reports the effective value of every variable the caller
    // asked about — here, whatever `env` says, else the "inherited" one the
    // fake stands in for.
    const report = (opts.reportEnv as string[] | undefined) ?? [];
    const env = (opts.env as Record<string, string> | undefined) ?? {};
    const values: Record<string, string> = {};
    for (const name of report) {
      const value = env[name] ?? inheritedEnv[name];
      if (value) values[name] = value;
    }
    (opts.onEnvReport as ((v: Record<string, string>) => void) | undefined)?.(
      values,
    );
    return {};
  }),
}));
/** Stands in for the environment Silo itself was launched with. */
const inheritedEnv: Record<string, string> = {};
vi.mock("./acp-jsonrpc", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./acp-jsonrpc")>();
  return {
    ...actual,
    createAcpClient: vi.fn((_t: unknown, cb: AcpClientCallbacks) => {
      captured = cb;
      return fakeClient;
    }),
  };
});

// --- mock the transcript journal — real disk I/O has no place in a unit test,
// and every `connect()` now creates a writer regardless of a restore. Kept as
// an in-memory fake per (workspaceId, sessionId) rather than plain `vi.fn()`s
// so a test can seed a prior journal and assert what got appended to it.
const journalFiles = new Map<string, string[]>();
function journalKey(workspaceId: string, sessionId: string): string {
  return `${workspaceId}:${sessionId}`;
}
vi.mock("./chat-session-journal", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./chat-session-journal")>();
  return {
    ...actual,
    readJournalLines: vi.fn(
      async (workspaceId: string, sessionId: string) =>
        journalFiles.get(journalKey(workspaceId, sessionId)) ?? [],
    ),
    createJournalWriter: vi.fn(
      (workspaceId: string, sessionId: string, seed: readonly string[]) => {
        const key = journalKey(workspaceId, sessionId);
        const lines = [...seed];
        return {
          append: vi.fn((update: unknown) => {
            lines.push(JSON.stringify(update));
            journalFiles.set(key, lines);
          }),
          flush: vi.fn(async () => {
            journalFiles.set(key, lines);
          }),
          dropSeed: vi.fn((n: number) => {
            lines.splice(0, n);
            journalFiles.set(key, lines);
          }),
          snapshotLines: vi.fn(() => [...lines]),
          dispose: vi.fn(),
        };
      },
    ),
  };
});

import { store } from "../../state/store";
import type { WorkspaceInternal } from "../../state/types";
import { replaceAgentProfiles } from "../../state/agent-profiles";
import { outputStore } from "../output-store";
import {
  chatAgentInfos,
  getChatAgentEntry,
  resetChatAgentRegistry,
} from "./chat-agent-registry";
import { createAgentSessionsService } from "./acp-sessions-service";
import {
  _resetDormantChatSessionsForTests,
  startChatSessionStatusPersistence,
} from "./chat-session-restore";
import {
  _resetAgentSurfaceRegistryForTests,
  setActiveDockPanel,
  setPanelAgentSession,
} from "./agent-surface-registry";

function ws(id: string): WorkspaceInternal {
  return {
    id,
    name: id,
    folder: `/ws/${id}`,
    createdAt: "",
    lastOpenedAt: "",
    terminals: [],
    editors: [],
    dockLayout: null,
    previewEditorId: null,
  };
}

let hasAgentsPermission = true;
const service = createAgentSessionsService(() => hasAgentsPermission);

beforeEach(() => {
  resetChatAgentRegistry();
  _resetAgentSurfaceRegistryForTests();
  journalFiles.clear();
  store.workspaces = { active: ws("active"), other: ws("other") };
  store.chatSessionState = {};
  store.activeWorkspaceId = "active";
  transportCalls.length = 0;
  for (const k of Object.keys(inheritedEnv)) delete inheritedEnv[k];
  _resetDormantChatSessionsForTests();
  // The status rows a restore reads back are written by this listener; without
  // it the service would look like it persists nothing.
  startChatSessionStatusPersistence();
  hasAgentsPermission = true;
  replaceAgentProfiles([
    {
      id: "claude-chat",
      label: "Claude (chat)",
      launch: { interface: "chat", command: "npx", args: ["claude-acp"] },
      assumedAgentId: "claude",
    },
    {
      id: "claude-term",
      label: "Claude (terminal)",
      launch: { interface: "terminal", command: "claude" },
    },
  ]);
  fakeClient.initialize.mockReset().mockResolvedValue({
    agentInfo: { title: "Claude Code" },
    agentCapabilities: { loadSession: true },
    authMethods: [],
    raw: {},
  });
  fakeClient.newSession
    .mockReset()
    .mockResolvedValue({ sessionId: "s1", configOptions: [], raw: {} });
  fakeClient.loadSession
    .mockReset()
    .mockResolvedValue({ sessionId: "s1", configOptions: [] });
  fakeClient.resumeSession.mockReset().mockResolvedValue({ configOptions: [] });
  fakeClient.closeSession.mockReset().mockResolvedValue(undefined);
  fakeClient.prompt.mockReset().mockResolvedValue({ stopReason: "end_turn" });
  fakeClient.cancel.mockReset();
  fakeClient.setConfigOption.mockReset().mockResolvedValue(null);
  fakeClient.setMode.mockReset().mockResolvedValue(undefined);
  fakeClient.setModel.mockReset().mockResolvedValue(undefined);
  fakeClient.dispose.mockReset();
});

describe("connect() gating", () => {
  it('rejects without the "agents" permission', async () => {
    hasAgentsPermission = false;
    await expect(service.connect("claude-chat")).rejects.toThrow(
      /"agents" permission/i,
    );
  });

  it("rejects an unknown profile id", async () => {
    await expect(service.connect("nope")).rejects.toThrow(/no agent profile/i);
  });

  it("rejects a Terminal profile", async () => {
    await expect(service.connect("claude-term")).rejects.toThrow(
      /Terminal profile/i,
    );
  });

  it("rejects when there is no target workspace", async () => {
    store.activeWorkspaceId = null;
    await expect(service.connect("claude-chat")).rejects.toThrow(
      /no workspace/i,
    );
  });
});

describe("connect() success", () => {
  it("registers a Chat AgentInfo with declared identity and resume capability", async () => {
    const handle = await service.connect("claude-chat");
    expect(handle.id).toBe("chat:s1");
    expect(handle.agentName).toBe("Claude Code");
    expect(handle.canResume).toBe(true);

    const infos = chatAgentInfos();
    expect(infos).toHaveLength(1);
    expect(infos[0]).toMatchObject({
      id: "chat:s1",
      kind: "chat",
      workspaceId: "active",
      isAgent: true,
      activity: "idle",
      needsAttention: false,
      canResume: true,
      sessionId: "s1",
      agentName: "Claude Code",
      agentId: "claude",
    });
    expect(infos[0].terminalId).toBeUndefined();
  });

  it("falls back to the profile label when the agent declares no identity", async () => {
    fakeClient.initialize.mockResolvedValue({
      agentInfo: null,
      agentCapabilities: {},
      authMethods: [],
      raw: {},
    });
    const handle = await service.connect("claude-chat");
    expect(handle.agentName).toBe("Claude (chat)");
    expect(handle.canResume).toBe(false);
  });

  it("rejects with the agent's own message when session/new fails", async () => {
    const { AcpRpcError } =
      await vi.importActual<typeof import("./acp-jsonrpc")>("./acp-jsonrpc");
    fakeClient.newSession.mockRejectedValue(
      new AcpRpcError({ code: -32000, message: "please sign in" }),
    );
    await expect(service.connect("claude-chat")).rejects.toThrow(
      /please sign in/,
    );
    expect(chatAgentInfos()).toEqual([]);
    expect(fakeClient.dispose).toHaveBeenCalled();
  });
});

describe("AgentInfo.title — the agent's own words, when it volunteers them", () => {
  it("falls back to the user's profile label, not the agent's declared name", async () => {
    // `agentInfo.title` is "Claude Code" here, but for an adapter that string
    // is the adapter's product name ("pi ACP adapter") — never what the user
    // chose. The tab shows the profile label until the agent volunteers a real
    // title; `agentName` still carries the declared name for consumers.
    const handle = await service.connect("claude-chat");
    expect(chatAgentInfos()[0].title).toBe("Claude (chat)");
    expect(handle.agentName).toBe("Claude Code");
  });

  it("a session_info_update replaces it", async () => {
    await service.connect("claude-chat");
    captured.onUpdate({
      sessionUpdate: "session_info_update",
      title: "Refactor the dock registry",
    } as never);
    expect(chatAgentInfos()[0].title).toBe("Refactor the dock registry");
  });

  it("reads a nested info object too, and ignores an empty title", async () => {
    await service.connect("claude-chat");
    captured.onUpdate({
      sessionUpdate: "session_info_update",
      info: { title: "  Wire up the badge  " },
    } as never);
    expect(chatAgentInfos()[0].title).toBe("Wire up the badge");

    captured.onUpdate({
      sessionUpdate: "session_info_update",
      title: "   ",
    } as never);
    expect(chatAgentInfos()[0].title).toBe("Wire up the badge");
  });

  it("a session that never gets one keeps the profile label — no synthesised summary", async () => {
    await service.connect("claude-chat");
    captured.onUpdate({
      sessionUpdate: "agent_message_chunk",
      content: { text: "hello" },
    } as never);
    expect(chatAgentInfos()[0].title).toBe("Claude (chat)");
  });
});

describe("turn lifecycle → ctx.agents status", () => {
  it("prompt() drives working → idle and raises attention on every finish", async () => {
    const handle = await service.connect("claude-chat", {
      workspaceId: "other",
    });
    let resolvePrompt!: (v: { stopReason: string }) => void;
    fakeClient.prompt.mockReturnValue(
      new Promise((r) => {
        resolvePrompt = r;
      }),
    );

    const p = handle.prompt([{ type: "text", text: "hi" }]);
    expect(chatAgentInfos()[0]).toMatchObject({ activity: "working" });

    resolvePrompt({ stopReason: "end_turn" });
    await p;
    expect(chatAgentInfos()[0]).toMatchObject({
      activity: "idle",
      needsAttention: true,
    });
  });

  // The one attention rule, from `agent-turn-model.ts`: a finish nobody
  // witnessed raises. `witnessed` means "the user is looking at *this
  // session's tab*" — not "its workspace is active", which was the drift that
  // left a Chat turn finishing in a background tab of the foreground
  // workspace with no badge at all.
  it("raises attention for a finish nobody was looking at", async () => {
    const handle = await service.connect("claude-chat");
    await handle.prompt([{ type: "text", text: "hi" }]);
    expect(chatAgentInfos()[0]).toMatchObject({
      activity: "idle",
      needsAttention: true,
    });
  });

  it("raises no attention for a finish the user watched — the host knows which tab is active", async () => {
    const handle = await service.connect("claude-chat");
    // Exactly what the Chat panel's `api.setAgentSession(id)` produces, plus
    // the dock reporting that panel as active. No help from the panel needed.
    setPanelAgentSession("acp-chat:p1", handle.id);
    setActiveDockPanel("acp-chat:p1");
    await handle.prompt([{ type: "text", text: "hi" }]);
    expect(chatAgentInfos()[0]).toMatchObject({
      activity: "idle",
      needsAttention: false,
    });
  });

  it("a cancelled turn raises no attention — the user is already there", async () => {
    const handle = await service.connect("claude-chat");
    fakeClient.prompt.mockResolvedValue({ stopReason: "cancelled" });
    await handle.prompt([{ type: "text", text: "hi" }]);
    expect(chatAgentInfos()[0]).toMatchObject({
      activity: "idle",
      needsAttention: false,
    });
  });

  // A turn an agent handles entirely on its own — a retry loop it never
  // reports as a JSON-RPC error, ending in an ordinary `stopReason` — leaves
  // nothing else in this channel to diagnose from (recon 2026-09-10: pi-acp's
  // own auto-retry surfaces only as prose in the transcript). The duration is
  // the one signal Silo can log for free, regardless of what the agent chose
  // to report.
  it("logs a session/prompt turn's outcome and duration to the Agents channel", async () => {
    const handle = await service.connect("claude-chat");
    fakeClient.prompt.mockResolvedValue({ stopReason: "end_turn" });
    outputStore.channels["silo:agents"]!.entries.length = 0;

    await handle.prompt([{ type: "text", text: "hi" }]);

    const entries = outputStore.channels["silo:agents"]!.entries;
    const line = entries.find((e) =>
      e.message.includes(`session/prompt for ${handle.sessionId}`),
    );
    expect(line?.message).toMatch(
      /session\/prompt for .+ finished \(end_turn\) in \d+ms\./,
    );
  });

  it("logs a session/prompt failure to the Agents channel, not just to the caller", async () => {
    const handle = await service.connect("claude-chat");
    fakeClient.prompt.mockRejectedValue(new Error("Internal error"));
    outputStore.channels["silo:agents"]!.entries.length = 0;

    await expect(
      handle.prompt([{ type: "text", text: "hi" }]),
    ).rejects.toThrow();

    const entries = outputStore.channels["silo:agents"]!.entries;
    const line = entries.find((e) =>
      e.message.includes(`session/prompt failed for ${handle.sessionId}`),
    );
    expect(line?.message).toContain("Internal error");
  });

  it("a permission request raises attention; answering clears it", async () => {
    const handle = await service.connect("claude-chat");
    const seen = vi.fn();
    handle.onPermission(seen);

    const respondSpy = vi.fn();
    captured.onPermission(
      {
        toolCallId: "tc1",
        title: "Write a file",
        options: [{ optionId: "allow", name: "Allow", kind: "allow_once" }],
        raw: {},
      },
      respondSpy,
    );
    expect(chatAgentInfos()[0]).toMatchObject({ needsAttention: true });
    expect(seen).toHaveBeenCalledOnce();

    seen.mock.calls[0][0].respond("allow");
    expect(respondSpy).toHaveBeenCalledWith({
      outcome: "selected",
      optionId: "allow",
    });
    expect(chatAgentInfos()[0]).toMatchObject({ needsAttention: false });
  });

  it("answers a permission request cancelled when no listener is registered", async () => {
    await service.connect("claude-chat");
    const respondSpy = vi.fn();
    captured.onPermission(
      { toolCallId: "tc1", title: "x", options: [], raw: {} },
      respondSpy,
    );
    expect(respondSpy).toHaveBeenCalledWith({ outcome: "cancelled" });
  });

  it("an abnormal connection close moves the session to error, without stacking an attention flag on it", async () => {
    // Terminal parity: `activity: "error"` is a loud state every consumer
    // renders on its own, so the shared turn core leaves attention alone.
    await service.connect("claude-chat");
    captured.onClosed(new Error("agent died"));
    expect(chatAgentInfos()[0]).toMatchObject({
      activity: "error",
      needsAttention: false,
    });
  });

  it("dispose() kills the client and drops the session", async () => {
    const handle = await service.connect("claude-chat");
    handle.dispose();
    expect(fakeClient.dispose).toHaveBeenCalled();
    expect(chatAgentInfos()).toEqual([]);
    handle.dispose(); // idempotent
  });

  it("cancel() forwards to the client", async () => {
    const handle = await service.connect("claude-chat");
    handle.cancel();
    expect(fakeClient.cancel).toHaveBeenCalledWith("s1");
  });
});

describe("session config options (RFC 0038 Session 3.1)", () => {
  const cursorConfig = [
    {
      id: "mode",
      name: "Mode",
      category: "mode",
      type: "select",
      currentValue: "agent",
      options: [
        { value: "agent", name: "Agent" },
        { value: "plan", name: "Plan" },
      ],
    },
    {
      id: "model",
      name: "Model",
      category: "model",
      type: "select",
      currentValue: "auto",
      options: [
        { value: "auto", name: "Auto" },
        { value: "opus", name: "Opus" },
      ],
    },
  ];

  it("surfaces whatever configOptions the agent advertised", async () => {
    fakeClient.newSession.mockResolvedValue({
      sessionId: "s1",
      configOptions: cursorConfig,
      raw: {},
    });
    const handle = await service.connect("claude-chat");
    expect(handle.configOptions.map((o) => o.id)).toEqual(["mode", "model"]);
    expect(handle.configOptions[1]).toMatchObject({
      category: "model",
      currentValue: "auto",
    });
  });

  it("is empty when the agent advertised none", async () => {
    const handle = await service.connect("claude-chat");
    expect(handle.configOptions).toEqual([]);
  });

  const withConfig = (configOptions: unknown[]) =>
    fakeClient.newSession.mockResolvedValue({
      sessionId: "s1",
      configOptions,
      raw: {},
    });

  it("writes through the generic session/set_config_option", async () => {
    withConfig(cursorConfig);
    const handle = await service.connect("claude-chat");
    const changed = vi.fn();
    handle.onConfigOptionsChanged(changed);

    await handle.setConfigOption("mode", "plan");
    expect(fakeClient.setConfigOption).toHaveBeenCalledWith(
      "s1",
      "mode",
      "plan",
    );
    expect(fakeClient.setMode).not.toHaveBeenCalled();
    expect(
      handle.configOptions.find((o) => o.id === "mode")!.currentValue,
    ).toBe("plan");
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("works for a category Silo has no typed method for", async () => {
    withConfig([
      {
        id: "effort",
        name: "Effort",
        category: "thought_level",
        type: "select",
        currentValue: "default",
        options: [
          { value: "default", name: "Default" },
          { value: "high", name: "High" },
        ],
      },
    ]);
    const handle = await service.connect("claude-chat");
    await handle.setConfigOption("effort", "high");
    expect(fakeClient.setConfigOption).toHaveBeenCalledWith(
      "s1",
      "effort",
      "high",
    );
    expect(handle.configOptions[0].currentValue).toBe("high");
  });

  it("replaces the whole snapshot from the agent's response", async () => {
    withConfig(cursorConfig);
    // Setting the model moved the mode too — the agent is authoritative.
    fakeClient.setConfigOption.mockResolvedValue([
      { ...cursorConfig[0], currentValue: "plan" },
      { ...cursorConfig[1], currentValue: "opus" },
    ]);
    const handle = await service.connect("claude-chat");
    await handle.setConfigOption("model", "opus");
    expect(handle.configOptions.map((o) => o.currentValue)).toEqual([
      "plan",
      "opus",
    ]);
  });

  it("falls back to the typed setter when the agent has no generic one", async () => {
    const { AcpRpcError } =
      await vi.importActual<typeof import("./acp-jsonrpc")>("./acp-jsonrpc");
    withConfig(cursorConfig);
    fakeClient.setConfigOption.mockRejectedValue(
      new AcpRpcError({ code: -32601, message: "Method not found" }),
    );
    const handle = await service.connect("claude-chat");

    await handle.setConfigOption("mode", "plan");
    expect(fakeClient.setMode).toHaveBeenCalledWith("s1", "plan");
    await handle.setConfigOption("model", "opus");
    expect(fakeClient.setModel).toHaveBeenCalledWith("s1", "opus");
  });

  it("surfaces an agent-side refusal rather than swallowing it", async () => {
    const { AcpRpcError } =
      await vi.importActual<typeof import("./acp-jsonrpc")>("./acp-jsonrpc");
    withConfig(cursorConfig);
    // Not -32601: the agent has the method and rejected this option.
    fakeClient.setConfigOption.mockRejectedValue(
      new AcpRpcError({
        code: -32603,
        message: "Unknown config option: model",
      }),
    );
    const handle = await service.connect("claude-chat");
    await expect(handle.setConfigOption("model", "opus")).rejects.toThrow(
      /Unknown config option/,
    );
    expect(fakeClient.setModel).not.toHaveBeenCalled();
    // and the stale value is not optimistically moved
    expect(
      handle.configOptions.find((o) => o.id === "model")!.currentValue,
    ).toBe("auto");
  });

  it("rejects an unknown id or a value outside the entry's options", async () => {
    withConfig(cursorConfig);
    const handle = await service.connect("claude-chat");
    await expect(handle.setConfigOption("nope", "x")).rejects.toThrow(
      /no session config option/i,
    );
    await expect(handle.setConfigOption("mode", "bogus")).rejects.toThrow(
      /not a choice/i,
    );
    expect(fakeClient.setConfigOption).not.toHaveBeenCalled();
  });

  it("applies profile sessionConfig defaults on a fresh connect", async () => {
    replaceAgentProfiles([
      {
        id: "claude-chat",
        label: "Claude (chat)",
        launch: {
          interface: "chat",
          command: "npx",
          args: ["claude-acp"],
          sessionConfig: { mode: "plan", model: "opus" },
        },
        assumedAgentId: "claude",
      },
    ]);
    withConfig(cursorConfig);
    fakeClient.setConfigOption
      .mockResolvedValueOnce([
        { ...cursorConfig[0], currentValue: "plan" },
        cursorConfig[1],
      ])
      .mockResolvedValueOnce([
        { ...cursorConfig[0], currentValue: "plan" },
        { ...cursorConfig[1], currentValue: "opus" },
      ]);
    const handle = await service.connect("claude-chat");
    expect(fakeClient.setConfigOption).toHaveBeenCalledWith(
      "s1",
      "mode",
      "plan",
    );
    expect(fakeClient.setConfigOption).toHaveBeenCalledWith(
      "s1",
      "model",
      "opus",
    );
    expect(handle.configOptions.map((o) => o.currentValue)).toEqual([
      "plan",
      "opus",
    ]);
  });

  it("does not apply profile sessionConfig when resuming a session", async () => {
    replaceAgentProfiles([
      {
        id: "claude-chat",
        label: "Claude (chat)",
        launch: {
          interface: "chat",
          command: "npx",
          args: ["claude-acp"],
          sessionConfig: { mode: "plan" },
        },
        assumedAgentId: "claude",
      },
    ]);
    fakeClient.loadSession.mockResolvedValue({
      sessionId: "prior",
      configOptions: cursorConfig,
    });
    const handle = await service.connect("claude-chat", {
      resume: { sessionId: "prior" },
    });
    expect(handle.resumeOutcome).toBe("resumed");
    expect(fakeClient.setConfigOption).not.toHaveBeenCalled();
  });

  it("folds a current_mode_update the agent sent itself back into currentValue", async () => {
    fakeClient.newSession.mockResolvedValue({
      sessionId: "s1",
      configOptions: cursorConfig,
      raw: {},
    });
    const handle = await service.connect("claude-chat");
    const changed = vi.fn();
    handle.onConfigOptionsChanged(changed);

    captured.onUpdate({
      sessionUpdate: "current_mode_update",
      currentModeId: "plan",
    });
    expect(
      handle.configOptions.find((o) => o.id === "mode")!.currentValue,
    ).toBe("plan");
    expect(changed).toHaveBeenCalledTimes(1);
  });
});

// RFC 0040 — commands (skills included, unsplit) and prompt capabilities.
describe("session commands and prompt capabilities (RFC 0040)", () => {
  it("is empty until the agent's first available_commands_update", async () => {
    const handle = await service.connect("claude-chat");
    expect(handle.commands).toEqual([]);
  });

  it("surfaces commands from available_commands_update, skills included", async () => {
    const handle = await service.connect("claude-chat");
    const changed = vi.fn();
    handle.onCommandsChanged(changed);

    captured.onUpdate({
      sessionUpdate: "available_commands_update",
      availableCommands: [
        {
          name: "compact",
          description: "Manually compact the session context",
          input: { hint: "optional custom instructions" },
        },
        { name: "skill:code-review", description: "Review the changes" },
      ],
    });

    expect(handle.commands).toEqual([
      {
        name: "compact",
        description: "Manually compact the session context",
        input: { hint: "optional custom instructions" },
      },
      { name: "skill:code-review", description: "Review the changes" },
    ]);
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("replaces the whole list on a later available_commands_update", async () => {
    const handle = await service.connect("claude-chat");
    captured.onUpdate({
      sessionUpdate: "available_commands_update",
      availableCommands: [{ name: "compact" }],
    });
    captured.onUpdate({
      sessionUpdate: "available_commands_update",
      availableCommands: [{ name: "review" }],
    });
    expect(handle.commands.map((c) => c.name)).toEqual(["review"]);
  });

  it("defaults every promptCapabilities field to false when the agent sent none", async () => {
    const handle = await service.connect("claude-chat");
    expect(handle.promptCapabilities).toEqual({
      image: false,
      audio: false,
      embeddedContext: false,
    });
  });

  it("reads promptCapabilities from initialize, defaulting an absent field to false", async () => {
    fakeClient.initialize.mockResolvedValue({
      agentInfo: { title: "Claude Code" },
      agentCapabilities: { loadSession: true },
      promptCapabilities: { image: true, embeddedContext: true },
      authMethods: [],
      raw: {},
    });
    const handle = await service.connect("claude-chat");
    expect(handle.promptCapabilities).toEqual({
      image: true,
      audio: false,
      embeddedContext: true,
    });
  });
});

// RFC 0038 phase 3: the extension owns its UI, so `ctx.agents.reveal(id)` can
// only focus a Chat session's transcript if the extension said how.
describe("connect({ reveal })", () => {
  it("registers the caller's reveal as the session's host control", async () => {
    const reveal = vi.fn();
    await service.connect("claude-chat", { reveal });
    getChatAgentEntry("chat:s1")!.controls.reveal!();
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  it("registers no reveal control when the caller supplied none", async () => {
    await service.connect("claude-chat");
    expect(getChatAgentEntry("chat:s1")!.controls.reveal).toBeUndefined();
  });

  it("swallows a throwing reveal callback — a click must not break reveal()", async () => {
    await service.connect("claude-chat", {
      reveal: () => {
        throw new Error("panel is gone");
      },
    });
    expect(() =>
      getChatAgentEntry("chat:s1")!.controls.reveal!(),
    ).not.toThrow();
  });
});

// RFC 0042 Phase 1 — the restore flow: resume → load → journal.
describe("connect({ resume }) — Chat session resurrection", () => {
  function seedJournal(sessionId: string, updates: Record<string, unknown>[]) {
    journalFiles.set(
      journalKey("active", sessionId),
      updates.map((u) => JSON.stringify(u)),
    );
  }

  it("a plain connect (no resume) is resumeOutcome 'new' with an empty journal and chatResumeState 'live'", async () => {
    const handle = await service.connect("claude-chat");
    expect(handle.resumeOutcome).toBe("new");
    expect(handle.journal).toEqual([]);
    expect(handle.sessionId).toBe("s1");
    expect(chatAgentInfos()[0].chatResumeState).toBe("live");
    expect(fakeClient.resumeSession).not.toHaveBeenCalled();
    expect(fakeClient.loadSession).not.toHaveBeenCalled();
  });

  // Dave's report (2026-09-09): after a restart, the tab reads a generic
  // fallback until reconnect finishes, even though the agent's own title was
  // already known before the app closed. `initialize` alone measured
  // 3.7–6.5s live, well before `resume`/`load` even starts.
  describe("the placeholder registered before the handshake resolves", () => {
    it("shows the last-known title immediately, before initialize() resolves", async () => {
      let resolveInit!: (v: unknown) => void;
      fakeClient.initialize.mockReturnValue(
        new Promise((r) => {
          resolveInit = r;
        }),
      );

      const connectPromise = service.connect("claude-chat", {
        resume: { sessionId: "old-id" },
        title: "Refactor the dock registry",
      });

      // Still mid-handshake — nothing has resolved yet.
      expect(chatAgentInfos()).toEqual([
        expect.objectContaining({
          id: "chat:old-id",
          workspaceId: "active",
          title: "Refactor the dock registry",
          kind: "chat",
          sessionId: "old-id",
          chatResumeState: "resuming",
        }),
      ]);

      resolveInit({
        agentInfo: { title: "Claude Code" },
        agentCapabilities: {},
        sessionCapabilities: {},
        authMethods: [],
        raw: {},
      });
      await connectPromise;
    });

    it("falls back to the profile label when no title was passed", () => {
      let resolveInit!: (v: unknown) => void;
      fakeClient.initialize.mockReturnValue(
        new Promise((r) => {
          resolveInit = r;
        }),
      );
      void service.connect("claude-chat", { resume: { sessionId: "old-id" } });
      expect(chatAgentInfos()[0]).toMatchObject({ title: "Claude (chat)" });
      resolveInit({
        agentInfo: {},
        agentCapabilities: {},
        sessionCapabilities: {},
        authMethods: [],
        raw: {},
      });
    });

    it("registers nothing for a plain connect with no resume target", () => {
      let resolveInit!: (v: unknown) => void;
      fakeClient.initialize.mockReturnValue(
        new Promise((r) => {
          resolveInit = r;
        }),
      );
      void service.connect("claude-chat");
      expect(chatAgentInfos()).toEqual([]);
      resolveInit({
        agentInfo: {},
        agentCapabilities: {},
        sessionCapabilities: {},
        authMethods: [],
        raw: {},
      });
    });

    it("is removed, not left dangling, when initialize() itself fails", async () => {
      fakeClient.initialize.mockRejectedValue(new Error("spawn failed"));
      await expect(
        service.connect("claude-chat", { resume: { sessionId: "old-id" } }),
      ).rejects.toThrow();
      expect(chatAgentInfos()).toEqual([]);
    });

    it("is overwritten in place, not duplicated, once the real registration lands under the same id", async () => {
      // `loadSession` keeps the same id here (no adoption) — the case where
      // the placeholder's id and the final id coincide.
      fakeClient.loadSession.mockResolvedValue({
        sessionId: "old-id",
        configOptions: [],
      });
      const handle = await service.connect("claude-chat", {
        resume: { sessionId: "old-id" },
        title: "Was working on the CSS surface",
      });
      expect(chatAgentInfos()).toHaveLength(1);
      expect(handle.id).toBe("chat:old-id");
      expect(chatAgentInfos()[0].chatResumeState).not.toBe("resuming");
    });

    // Dave's report (2026-09-09, second round): the restored tab painted the
    // right title, then snapped back to "Claude Agent" the moment the
    // handshake finished — and stayed there until the next message. The
    // placeholder was right; the *real* registration overwrote it with the
    // agent's product name, and the panel then persisted that over the good
    // title.
    it("keeps the last-known title after the handshake resolves, rather than reverting to the agent's product name", async () => {
      fakeClient.loadSession.mockResolvedValue({
        sessionId: "old-id",
        configOptions: [],
      });
      await service.connect("claude-chat", {
        resume: { sessionId: "old-id" },
        title: "Was working on the CSS surface",
      });
      expect(chatAgentInfos()[0]).toMatchObject({
        title: "Was working on the CSS surface",
        // The product name is still reported — as the agent's name, which is
        // what that field is for.
        agentName: "Claude Code",
      });
    });

    it("keeps the last-known title across a session/load id adoption too", async () => {
      fakeClient.initialize.mockResolvedValue({
        agentInfo: { title: "Claude Code" },
        agentCapabilities: { loadSession: true },
        sessionCapabilities: {},
        authMethods: [],
        raw: {},
      });
      fakeClient.loadSession.mockResolvedValue({
        sessionId: "adopted-id",
        configOptions: [],
      });
      await service.connect("claude-chat", {
        resume: { sessionId: "old-id" },
        title: "Was working on the CSS surface",
      });
      expect(chatAgentInfos()[0]).toMatchObject({
        id: "chat:adopted-id",
        title: "Was working on the CSS surface",
      });
    });

    // Same in-flight ordering that lost the journal's replay lines: a
    // `session_info_update` inside a `session/load` replay is patched onto
    // whatever id the session is filed under *at that moment*. With `infoId`
    // still empty until after the handshake, every one of them was dropped —
    // and the title the agent had just volunteered was then overwritten by
    // the persisted one.
    it("takes a title the agent volunteers mid-handshake over the persisted one", async () => {
      fakeClient.initialize.mockResolvedValue({
        agentInfo: { title: "Claude Code" },
        agentCapabilities: { loadSession: true },
        sessionCapabilities: {},
        authMethods: [],
        raw: {},
      });
      fakeClient.loadSession.mockImplementation(async () => {
        captured.onUpdate({
          sessionUpdate: "session_info_update",
          title: "Fix the dock panel merge",
        } as never);
        return { sessionId: "old-id", configOptions: [] };
      });

      await service.connect("claude-chat", {
        resume: { sessionId: "old-id" },
        title: "Was working on the CSS surface",
      });

      expect(chatAgentInfos()).toHaveLength(1);
      expect(chatAgentInfos()[0].title).toBe("Fix the dock panel merge");
    });

    // The panel's own copy of the title lives in its persisted panel state,
    // which can go missing (a stale layout snapshot overwriting the record —
    // seen live 2026-09-10). Silo's own record of the session is the backstop.
    it("falls back to the title Silo itself remembers when the caller passes none", async () => {
      store.chatSessionState = {
        "chat:old-id": {
          workspaceId: "active",
          sessionId: "old-id",
          title: "Refactor the dock registry",
          canResume: true,
          lastLiveAt: "2026-09-09T00:00:00.000Z",
        },
      };
      fakeClient.loadSession.mockResolvedValue({
        sessionId: "old-id",
        configOptions: [],
      });

      await service.connect("claude-chat", { resume: { sessionId: "old-id" } });

      expect(chatAgentInfos()[0].title).toBe("Refactor the dock registry");
    });

    it("prefers the caller's title over the remembered one — the panel is closer to the session", async () => {
      store.chatSessionState = {
        "chat:old-id": {
          workspaceId: "active",
          sessionId: "old-id",
          title: "An older title",
          canResume: true,
          lastLiveAt: "2026-09-09T00:00:00.000Z",
        },
      };
      fakeClient.loadSession.mockResolvedValue({
        sessionId: "old-id",
        configOptions: [],
      });

      await service.connect("claude-chat", {
        resume: { sessionId: "old-id" },
        title: "Was working on the CSS surface",
      });

      expect(chatAgentInfos()[0].title).toBe("Was working on the CSS surface");
    });

    it("a fresh session ignores options.title and falls back to the profile label", async () => {
      await service.connect("claude-chat", { title: "stale leftover" });
      expect(chatAgentInfos()[0].title).toBe("Claude (chat)");
    });

    it("is removed, not left dangling, when session/load adopts a different id", async () => {
      fakeClient.initialize.mockResolvedValue({
        agentInfo: { title: "Claude Code" },
        agentCapabilities: { loadSession: true },
        sessionCapabilities: {},
        authMethods: [],
        raw: {},
      });
      fakeClient.loadSession.mockResolvedValue({
        sessionId: "adopted-id",
        configOptions: [],
      });
      await service.connect("claude-chat", {
        resume: { sessionId: "old-id" },
        title: "Was working on the CSS surface",
      });
      // Only the final, adopted-id entry remains — the placeholder registered
      // under "old-id" must not survive as an orphan.
      expect(chatAgentInfos()).toHaveLength(1);
      expect(chatAgentInfos()[0].id).toBe("chat:adopted-id");
    });
  });

  // The shape a real `claude-agent-acp` sends: capabilities as details objects,
  // nested under `agentCapabilities`. Read as booleans, every one of them looked
  // unsupported — so `session/resume` was never attempted against claude and
  // every restore went through `session/load` (a fork on that adapter).
  it("takes session/resume when the agent advertises capabilities as objects, not booleans", async () => {
    fakeClient.initialize.mockResolvedValue({
      agentInfo: { title: "Claude Code" },
      agentCapabilities: { loadSession: {} },
      sessionCapabilities: { resume: {}, close: {}, list: {} },
      authMethods: [],
      raw: {},
    });
    seedJournal("old-id", [{ kind: "agent_message_chunk", text: "hi" }]);

    const handle = await service.connect("claude-chat", {
      resume: { sessionId: "old-id" },
    });

    expect(fakeClient.resumeSession).toHaveBeenCalledWith(
      "old-id",
      "/ws/active",
    );
    expect(fakeClient.loadSession).not.toHaveBeenCalled();
    expect(handle.resumeOutcome).toBe("resumed");
    expect(handle.canResume).toBe(true);
  });

  it("still calls session/close on teardown when close is advertised as an object", async () => {
    fakeClient.initialize.mockResolvedValue({
      agentInfo: { title: "Claude Code" },
      agentCapabilities: { loadSession: {} },
      sessionCapabilities: { close: {} },
      authMethods: [],
      raw: {},
    });
    const handle = await service.connect("claude-chat");
    await handle.dispose();
    expect(fakeClient.closeSession).toHaveBeenCalledWith("s1");
  });

  it("prefers session/resume when both capabilities are advertised, and paints the journal (no replay)", async () => {
    fakeClient.initialize.mockResolvedValue({
      agentInfo: { title: "Claude Code" },
      agentCapabilities: { loadSession: true },
      sessionCapabilities: { resume: true, close: true },
      authMethods: [],
      raw: {},
    });
    seedJournal("old-id", [{ kind: "agent_message_chunk", text: "hi" }]);

    const handle = await service.connect("claude-chat", {
      resume: { sessionId: "old-id" },
    });

    expect(fakeClient.resumeSession).toHaveBeenCalledWith(
      "old-id",
      "/ws/active",
    );
    expect(fakeClient.loadSession).not.toHaveBeenCalled();
    expect(fakeClient.newSession).not.toHaveBeenCalled();
    expect(handle.resumeOutcome).toBe("resumed");
    expect(handle.sessionId).toBe("old-id");
    expect(handle.journal).toEqual([
      { kind: "agent_message_chunk", text: "hi" },
    ]);
    expect(chatAgentInfos()[0].chatResumeState).toBe("resumed");
  });

  it("falls back to session/load when resume isn't advertised, and adopts a returned sessionId", async () => {
    fakeClient.initialize.mockResolvedValue({
      agentInfo: { title: "Claude Code" },
      agentCapabilities: { loadSession: true },
      sessionCapabilities: {},
      authMethods: [],
      raw: {},
    });
    fakeClient.loadSession.mockResolvedValue({
      sessionId: "adopted-id",
      configOptions: [],
    });
    seedJournal("old-id", [{ kind: "agent_message_chunk", text: "stale" }]);

    const handle = await service.connect("claude-chat", {
      resume: { sessionId: "old-id" },
    });

    expect(fakeClient.loadSession).toHaveBeenCalledWith("old-id", "/ws/active");
    expect(handle.resumeOutcome).toBe("resumed");
    // `load` replays the whole transcript itself — the pre-existing journal
    // is not also seeded in, or the replay would duplicate every turn.
    expect(handle.journal).toEqual([]);
    expect(handle.sessionId).toBe("adopted-id");
    expect(chatAgentInfos()[0]).toMatchObject({
      id: "chat:adopted-id",
      sessionId: "adopted-id",
    });
  });

  // Caught live (2026-09-09, real `claude`): a `session/load` replay's own
  // `session/update`s arrive on `callbacks.onUpdate` *while `loadSession()` is
  // still in flight* — well before `connect()` sees the result. A journal
  // writer created only after that call resolves silently misses all of it,
  // and a restored panel comes back with an empty transcript. This pins the
  // ordering the fix depends on: the writer must already be listening before
  // `loadSession`/`resumeSession` is called, not after.
  it("captures a load replay that streams in mid-call, not just what arrives after", async () => {
    fakeClient.initialize.mockResolvedValue({
      agentInfo: { title: "Claude Code" },
      agentCapabilities: { loadSession: true },
      sessionCapabilities: {},
      authMethods: [],
      raw: {},
    });
    seedJournal("old-id", []); // no prior journal — isolates the replay itself
    fakeClient.loadSession.mockImplementation(async () => {
      // Simulate the agent replaying before its RPC response comes back —
      // exactly the order every catalog agent uses (recon §5.2).
      captured.onUpdate({
        sessionUpdate: "user_message_chunk",
        content: { type: "text", text: "are you there?" },
      } as never);
      captured.onUpdate({
        sessionUpdate: "agent_message_chunk",
        content: { type: "text", text: "yes, still here" },
      } as never);
      return { sessionId: "old-id", configOptions: [] };
    });

    const handle = await service.connect("claude-chat", {
      resume: { sessionId: "old-id" },
    });

    expect(handle.resumeOutcome).toBe("resumed");
    expect(handle.journal.map((u) => u.kind)).toEqual([
      "user_message_chunk",
      "agent_message_chunk",
    ]);
    const lines = journalFiles.get(journalKey("active", "old-id")) ?? [];
    expect(lines.map((l) => JSON.parse(l).kind)).toEqual([
      "user_message_chunk",
      "agent_message_chunk",
    ]);
  });

  it("resume failing falls through to load", async () => {
    fakeClient.initialize.mockResolvedValue({
      agentInfo: { title: "Claude Code" },
      agentCapabilities: { loadSession: true },
      sessionCapabilities: { resume: true },
      authMethods: [],
      raw: {},
    });
    fakeClient.resumeSession.mockRejectedValue(new Error("stale session"));

    const handle = await service.connect("claude-chat", {
      resume: { sessionId: "old-id" },
    });

    expect(fakeClient.resumeSession).toHaveBeenCalled();
    expect(fakeClient.loadSession).toHaveBeenCalledWith("old-id", "/ws/active");
    expect(handle.resumeOutcome).toBe("resumed");
  });

  it("neither capability working, with a journal on disk, goes journal-only — never refuses to open", async () => {
    fakeClient.initialize.mockResolvedValue({
      agentInfo: { title: "Claude Code" },
      agentCapabilities: {},
      sessionCapabilities: {},
      authMethods: [],
      raw: {},
    });
    seedJournal("old-id", [
      { kind: "user_message_chunk", text: "are you there?" },
    ]);

    const handle = await service.connect("claude-chat", {
      resume: { sessionId: "old-id" },
    });

    expect(fakeClient.newSession).not.toHaveBeenCalled();
    expect(fakeClient.dispose).toHaveBeenCalled(); // the unused initialized client is freed
    expect(handle.resumeOutcome).toBe("journal-only");
    expect(handle.sessionId).toBe("old-id");
    expect(handle.journal).toEqual([
      { kind: "user_message_chunk", text: "are you there?" },
    ]);
    expect(chatAgentInfos()[0]).toMatchObject({
      chatResumeState: "journal-only",
      activity: "dead",
    });

    await expect(
      handle.prompt([{ type: "text", text: "hello?" }]),
    ).rejects.toThrow(/journal-only/i);
    expect(() => handle.cancel()).not.toThrow();
  });

  it("neither capability working, with no journal at all, falls through to a fresh session", async () => {
    fakeClient.initialize.mockResolvedValue({
      agentInfo: { title: "Claude Code" },
      agentCapabilities: {},
      sessionCapabilities: {},
      authMethods: [],
      raw: {},
    });

    const handle = await service.connect("claude-chat", {
      resume: { sessionId: "never-existed" },
    });

    expect(fakeClient.newSession).toHaveBeenCalled();
    expect(handle.resumeOutcome).toBe("new");
    expect(handle.sessionId).toBe("s1");
  });

  it("startFresh skips resume/load entirely, adopts the new id, and carries the journal over", async () => {
    fakeClient.initialize.mockResolvedValue({
      agentInfo: { title: "Claude Code" },
      agentCapabilities: { loadSession: true },
      sessionCapabilities: { resume: true },
      authMethods: [],
      raw: {},
    });
    seedJournal("old-id", [
      { kind: "user_message_chunk", text: "earlier turn" },
    ]);

    const handle = await service.connect("claude-chat", {
      resume: { sessionId: "old-id", startFresh: true },
    });

    expect(fakeClient.resumeSession).not.toHaveBeenCalled();
    expect(fakeClient.loadSession).not.toHaveBeenCalled();
    expect(fakeClient.newSession).toHaveBeenCalled();
    expect(handle.resumeOutcome).toBe("new");
    // Caught live (2026-09-09): keeping the *original*, already-known-dead id
    // instead means every future restore keeps retrying an id the agent has
    // never heard of, forever — even while the live conversation under the
    // new id works fine turn after turn. Adopt the new id, same as a
    // `session/load` id-adoption does, and carry the old journal into it.
    expect(handle.sessionId).toBe("s1");
    expect(handle.journal).toEqual([
      { kind: "user_message_chunk", text: "earlier turn" },
    ]);
  });

  it("appends the user's own prompt to the journal (the stream never echoes it)", async () => {
    const handle = await service.connect("claude-chat");
    await handle.prompt([{ type: "text", text: "hello there" }]);
    const lines = journalFiles.get(journalKey("active", "s1")) ?? [];
    const parsed = lines.map((l) => JSON.parse(l));
    expect(parsed).toContainEqual(
      expect.objectContaining({
        kind: "user_message_chunk",
        text: "hello there",
      }),
    );
  });

  it("calls session/close on a clean dispose when advertised, before killing the process", async () => {
    fakeClient.initialize.mockResolvedValue({
      agentInfo: { title: "Claude Code" },
      agentCapabilities: {},
      sessionCapabilities: { close: true },
      authMethods: [],
      raw: {},
    });
    const handle = await service.connect("claude-chat");
    handle.dispose();
    await vi.waitFor(() => {
      expect(fakeClient.closeSession).toHaveBeenCalledWith("s1");
      expect(fakeClient.dispose).toHaveBeenCalled();
    });
  });

  it("does not call session/close when the agent doesn't advertise it", async () => {
    const handle = await service.connect("claude-chat"); // default mock: no sessionCapabilities
    handle.dispose();
    expect(fakeClient.closeSession).not.toHaveBeenCalled();
    expect(fakeClient.dispose).toHaveBeenCalled();
  });
});

// The "paint from journal" half of the restore flow, independent of
// connect()'s "reconnect the agent" half (RFC 0042) — so a panel can read a
// session's journal without paying for a resume/load round trip first.
describe("readJournal()", () => {
  it('rejects without the "agents" permission', async () => {
    hasAgentsPermission = false;
    await expect(service.readJournal("s1")).rejects.toThrow(
      /"agents" permission/i,
    );
  });

  it("resolves [] for a session with no journal", async () => {
    await expect(service.readJournal("nope")).resolves.toEqual([]);
  });

  it("resolves [] when there is no target workspace, rather than rejecting", async () => {
    store.activeWorkspaceId = null;
    await expect(service.readJournal("s1")).resolves.toEqual([]);
  });

  it("reads the active workspace's journal for the given session id", async () => {
    journalFiles.set(
      journalKey("active", "s1"),
      [{ kind: "agent_message_chunk", text: "hi" }].map((u) =>
        JSON.stringify(u),
      ),
    );
    await expect(service.readJournal("s1")).resolves.toEqual([
      { kind: "agent_message_chunk", text: "hi" },
    ]);
  });

  it("reads a named workspace's journal, not just the active one", async () => {
    journalFiles.set(journalKey("other", "s2"), [
      JSON.stringify({ kind: "plan", plan: [] }),
    ]);
    await expect(
      service.readJournal("s2", { workspaceId: "other" }),
    ).resolves.toEqual([{ kind: "plan", plan: [] }]);
  });
});

// Caught live (2026-09-10): a real conversation was reported unresumable purely
// because the app had been relaunched from a shell exporting a different
// `CLAUDE_CONFIG_DIR`. An agent keeps its sessions inside its config directory,
// so which directory the child got at creation is part of the session's
// identity — not an environmental detail to re-derive on every launch.
describe("the config directory a session lives in", () => {
  it("records the directory the child actually ran with", async () => {
    inheritedEnv.CLAUDE_CONFIG_DIR = "/Users/dave/.claude-personal";

    await service.connect("claude-chat");

    expect(transportCalls[0].reportEnv).toEqual(["CLAUDE_CONFIG_DIR"]);
    expect(store.chatSessionState["chat:s1"].configDir).toBe(
      "/Users/dave/.claude-personal",
    );
  });

  it("spawns a restore against the recorded directory, not the ambient one", async () => {
    store.chatSessionState = {
      "chat:old-id": {
        workspaceId: "active",
        sessionId: "old-id",
        title: "Refactor the dock registry",
        canResume: true,
        activity: "idle",
        needsAttention: false,
        configDir: "/Users/dave/.claude-personal",
        lastLiveAt: "2026-09-10T00:00:00.000Z",
      },
    };
    // The app was relaunched somewhere else this time.
    inheritedEnv.CLAUDE_CONFIG_DIR = "/Users/dave/.claude";
    fakeClient.loadSession.mockResolvedValue({
      sessionId: "old-id",
      configOptions: [],
    });

    await service.connect("claude-chat", { resume: { sessionId: "old-id" } });

    expect(transportCalls[0].env).toMatchObject({
      CLAUDE_CONFIG_DIR: "/Users/dave/.claude-personal",
    });
    expect(store.chatSessionState["chat:old-id"].configDir).toBe(
      "/Users/dave/.claude-personal",
    );
  });

  it("leaves the environment alone for an agent with no config-dir variable", async () => {
    replaceAgentProfiles([
      {
        id: "claude-chat",
        label: "Claude (chat)",
        launch: { interface: "chat", command: "npx", args: ["acp"] },
        assumedAgentId: "cursor-agent",
      },
    ]);

    await service.connect("claude-chat");

    expect(transportCalls[0].reportEnv).toBeUndefined();
    expect(store.chatSessionState["chat:s1"].configDir).toBeUndefined();
  });
});

// A dock panel reads its own workspace from the host, which answers `""` until
// that dock's registration lands. Treating an empty string as a deliberate
// choice failed the connect outright — "No workspace to connect the Chat
// session in" on a panel sitting in a perfectly good workspace (2026-09-10).
describe("which workspace a session is filed under", () => {
  it("files the session under the workspace the caller names", async () => {
    await service.connect("claude-chat", { workspaceId: "other" });
    expect(chatAgentInfos()[0].workspaceId).toBe("other");
  });

  it("falls back to the active workspace for a blank one, rather than failing", async () => {
    await service.connect("claude-chat", { workspaceId: "" });
    expect(chatAgentInfos()[0].workspaceId).toBe("active");
  });

  it("still rejects when there is no workspace at all", async () => {
    store.activeWorkspaceId = null;
    await expect(
      service.connect("claude-chat", { workspaceId: "" }),
    ).rejects.toThrow(/no workspace/i);
  });
});

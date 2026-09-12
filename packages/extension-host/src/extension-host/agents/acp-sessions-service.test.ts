import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AcpClientCallbacks } from "./acp-jsonrpc";

// --- mock the JSON-RPC client + transport ---------------------------------
const fakeClient = {
  initialize: vi.fn(),
  newSession: vi.fn(),
  loadSession: vi.fn(),
  prompt: vi.fn(),
  cancel: vi.fn(),
  setConfigOption: vi.fn(),
  setMode: vi.fn(),
  setModel: vi.fn(),
  dispose: vi.fn(),
};
let captured: AcpClientCallbacks;

vi.mock("./acp-transport", () => ({
  createAcpTransport: vi.fn(() => ({})),
}));
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

import { store } from "../../state/store";
import type { WorkspaceInternal } from "../../state/types";
import { replaceAgentProfiles } from "../../state/agent-profiles";
import {
  chatAgentInfos,
  getChatAgentEntry,
  resetChatAgentRegistry,
} from "./chat-agent-registry";
import { createAgentSessionsService } from "./acp-sessions-service";
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
  store.workspaces = { active: ws("active"), other: ws("other") };
  store.activeWorkspaceId = "active";
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
  fakeClient.loadSession.mockReset().mockResolvedValue(undefined);
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
  it("registers with the declared agent name as the fallback", async () => {
    await service.connect("claude-chat");
    expect(chatAgentInfos()[0].title).toBe("Claude Code");
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

  it("a session that never gets one keeps its declared name — no synthesised summary", async () => {
    await service.connect("claude-chat");
    captured.onUpdate({
      sessionUpdate: "agent_message_chunk",
      content: { text: "hello" },
    } as never);
    expect(chatAgentInfos()[0].title).toBe("Claude Code");
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

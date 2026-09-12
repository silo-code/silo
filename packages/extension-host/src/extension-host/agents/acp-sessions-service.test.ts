import { describe, it, expect, beforeEach, vi } from "vitest";
import type { AcpClientCallbacks } from "./acp-jsonrpc";

// --- mock the JSON-RPC client + transport ---------------------------------
const fakeClient = {
  initialize: vi.fn(),
  newSession: vi.fn(),
  loadSession: vi.fn(),
  prompt: vi.fn(),
  cancel: vi.fn(),
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

const service = createAgentSessionsService();

beforeEach(() => {
  resetChatAgentRegistry();
  store.workspaces = { active: ws("active"), other: ws("other") };
  store.activeWorkspaceId = "active";
  store.chatAgents = true;
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
    .mockResolvedValue({ sessionId: "s1", raw: {} });
  fakeClient.loadSession.mockReset().mockResolvedValue(undefined);
  fakeClient.prompt.mockReset().mockResolvedValue({ stopReason: "end_turn" });
  fakeClient.cancel.mockReset();
  fakeClient.dispose.mockReset();
});

describe("connect() gating", () => {
  it("rejects when the chatAgents setting is off", async () => {
    store.chatAgents = false;
    await expect(service.connect("claude-chat")).rejects.toThrow(/turned off/i);
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

describe("turn lifecycle → ctx.agents status", () => {
  it("prompt() drives working → idle, raising attention only off the active workspace", async () => {
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
    // session is in "other", active workspace is "active" → needs attention
    expect(chatAgentInfos()[0]).toMatchObject({
      activity: "idle",
      needsAttention: true,
    });
  });

  it("prompt() on the active workspace ends idle with no attention", async () => {
    const handle = await service.connect("claude-chat");
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

  it("an abnormal connection close moves the session to error", async () => {
    await service.connect("claude-chat");
    captured.onClosed(new Error("agent died"));
    expect(chatAgentInfos()[0]).toMatchObject({
      activity: "error",
      needsAttention: true,
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

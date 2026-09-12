import { describe, it, expect, beforeEach } from "vitest";
import type { AgentInfo, DockPanelRecord } from "@silo-code/sdk";
import { store } from "../../state/store";
import type {
  PersistedChatSession,
  WorkspaceInternal,
} from "../../state/types";
import {
  peekPanelActivation,
  clearPanelActivation,
} from "../../docked/panel-activation-requests";
import {
  chatAgentInfos,
  getChatAgentEntry,
  patchChatAgent,
  registerChatAgent,
  removeChatAgent,
  resetChatAgentRegistry,
} from "./chat-agent-registry";
import {
  _resetAgentSurfaceRegistryForTests,
  agentSessionForPanel,
} from "./agent-surface-registry";
import {
  _resetDormantChatSessionsForTests,
  chatSessionStatus,
  noteChatSessionConfigDir,
  restoredActivity,
  chatSessionStatusChanged,
  dormantChatSessions,
  pruneOrphanedChatSessionStatuses,
  startChatSessionStatusPersistence,
  syncDormantChatSessions,
} from "./chat-session-restore";

function ws(id: string, panels: DockPanelRecord[] = []): WorkspaceInternal {
  return {
    id,
    name: id,
    folder: `/ws/${id}`,
    createdAt: "",
    lastOpenedAt: "",
    terminals: [],
    editors: [],
    panels,
    dockLayout: null,
    previewEditorId: null,
  };
}

function chatPanel(
  id: string,
  workspaceId: string,
  state: Record<string, unknown>,
): DockPanelRecord {
  return {
    id,
    kindId: "acp-chat",
    workspaceId,
    state,
    createdAt: "",
    lastActiveAt: "",
  };
}

function status(
  over: Partial<PersistedChatSession> = {},
): PersistedChatSession {
  return {
    workspaceId: "a",
    sessionId: "sess-1",
    title: "Refactor the dock registry",
    agentName: "Claude Code",
    agentId: "claude",
    canResume: true,
    activity: "idle",
    needsAttention: false,
    lastLiveAt: "2026-09-09T00:00:00.000Z",
    ...over,
  };
}

beforeEach(() => {
  resetChatAgentRegistry();
  _resetDormantChatSessionsForTests();
  _resetAgentSurfaceRegistryForTests();
  clearPanelActivation("a");
  clearPanelActivation("b");
  store.hydrated = true;
  store.workspaces = {};
  store.chatSessionState = {};
  store.activeWorkspaceId = "b";
});

// Dave's report (2026-09-09): after a restart into workspace B, a Chat agent
// left open in workspace A was missing from the Agents navigator until A was
// activated — because nothing registers an `AgentInfo` until the panel mounts,
// and a background workspace's dock never mounts.
describe("dormantChatSessions — what persistence alone can show", () => {
  it("describes a recorded Chat panel in a workspace nothing has visited", () => {
    const sessions = dormantChatSessions(
      { a: ws("a", [chatPanel("p1", "a", { sessionId: "sess-1" })]) },
      { "chat:sess-1": status() },
    );
    expect(sessions).toEqual([
      {
        panelId: "acp-chat:p1",
        panelRecordId: "p1",
        info: {
          id: "chat:sess-1",
          workspaceId: "a",
          title: "Refactor the dock registry",
          kind: "chat",
          isAgent: true,
          activity: "idle",
          needsAttention: false,
          stale: false,
          canResume: true,
          sessionId: "sess-1",
          agentName: "Claude Code",
          agentId: "claude",
          chatResumeState: "dormant",
        },
      },
    ]);
  });

  it("shows nothing for a panel whose session never got a persisted status", () => {
    expect(
      dormantChatSessions(
        { a: ws("a", [chatPanel("p1", "a", { sessionId: "sess-1" })]) },
        {},
      ),
    ).toEqual([]);
  });

  // The other half of the gate: a closed tab's conversation is over. Without
  // this, every session ever opened would come back as a phantom row.
  it("shows nothing for a persisted status no recorded panel references", () => {
    expect(
      dormantChatSessions({ a: ws("a") }, { "chat:sess-1": status() }),
    ).toEqual([]);
  });

  it("ignores a recorded panel with no session id in its state", () => {
    expect(
      dormantChatSessions(
        { a: ws("a", [chatPanel("p1", "a", { profileId: "claude-chat" })]) },
        { "chat:sess-1": status() },
      ),
    ).toEqual([]);
  });

  it("files the session under the workspace its panel is in, not the persisted one", () => {
    const sessions = dormantChatSessions(
      { b: ws("b", [chatPanel("p1", "b", { sessionId: "sess-1" })]) },
      { "chat:sess-1": status({ workspaceId: "a" }) },
    );
    expect(sessions[0].info.workspaceId).toBe("b");
  });

  it("registers one entry when two records somehow claim the same session", () => {
    const sessions = dormantChatSessions(
      {
        a: ws("a", [
          chatPanel("p1", "a", { sessionId: "sess-1" }),
          chatPanel("p2", "a", { sessionId: "sess-1" }),
        ]),
      },
      { "chat:sess-1": status() },
    );
    expect(sessions).toHaveLength(1);
  });
});

describe("chatSessionStatus — what is worth persisting", () => {
  const live: AgentInfo = {
    id: "chat:sess-1",
    workspaceId: "a",
    title: "Refactor the dock registry",
    kind: "chat",
    isAgent: true,
    activity: "working",
    needsAttention: false,
    stale: false,
    canResume: true,
    sessionId: "sess-1",
    agentName: "Claude Code",
    agentId: "claude",
    chatResumeState: "live",
  };

  it("captures the identity a later run can paint a row from", () => {
    expect(chatSessionStatus(live, "now")).toEqual({
      workspaceId: "a",
      sessionId: "sess-1",
      title: "Refactor the dock registry",
      agentName: "Claude Code",
      agentId: "claude",
      canResume: true,
      activity: "working",
      needsAttention: false,
      lastLiveAt: "now",
    });
  });

  it("skips a Terminal session — that side persists off its terminal record", () => {
    expect(chatSessionStatus({ ...live, kind: "terminal" }, "now")).toBeNull();
  });

  it("skips a session with no id to resume", () => {
    expect(
      chatSessionStatus({ ...live, sessionId: undefined }, "now"),
    ).toBeNull();
  });

  it("skips a dormant entry — it would only rewrite what it was built from", () => {
    expect(
      chatSessionStatus({ ...live, chatResumeState: "dormant" }, "now"),
    ).toBeNull();
  });

  it("treats a timestamp-only difference as no change, so a turn costs no write", () => {
    const prev = status();
    expect(
      chatSessionStatusChanged(prev, { ...prev, lastLiveAt: "later" }),
    ).toBe(false);
    expect(
      chatSessionStatusChanged(prev, { ...prev, title: "New title" }),
    ).toBe(true);
    expect(chatSessionStatusChanged(undefined, prev)).toBe(true);
  });
});

describe("syncDormantChatSessions — reconciling against the registry", () => {
  it("lists a background workspace's session without connecting anything", () => {
    store.workspaces = {
      a: ws("a", [chatPanel("p1", "a", { sessionId: "sess-1" })]),
      b: ws("b"),
    };
    store.chatSessionState = { "chat:sess-1": status() };

    syncDormantChatSessions();

    expect(chatAgentInfos()).toEqual([
      expect.objectContaining({
        id: "chat:sess-1",
        workspaceId: "a",
        title: "Refactor the dock registry",
        chatResumeState: "dormant",
      }),
    ]);
  });

  it("reveals by asking the panel's own dock to activate the tab", () => {
    store.workspaces = {
      a: ws("a", [chatPanel("p1", "a", { sessionId: "sess-1" })]),
    };
    store.chatSessionState = { "chat:sess-1": status() };
    syncDormantChatSessions();

    getChatAgentEntry("chat:sess-1")!.controls.reveal!();

    // The dock isn't mounted, so the request is recorded for it to apply on
    // arrival — the same path a cross-workspace terminal focus takes.
    expect(peekPanelActivation("a")).toBe("acp-chat:p1");
  });

  it("resumes by the same route — opening the panel is what reconnects it", () => {
    store.workspaces = {
      a: ws("a", [chatPanel("p1", "a", { sessionId: "sess-1" })]),
    };
    store.chatSessionState = { "chat:sess-1": status() };
    syncDormantChatSessions();

    getChatAgentEntry("chat:sess-1")!.controls.resume!();

    expect(peekPanelActivation("a")).toBe("acp-chat:p1");
  });

  it("leaves a live session alone — a real connection outranks a remembered one", () => {
    store.workspaces = {
      a: ws("a", [chatPanel("p1", "a", { sessionId: "sess-1" })]),
    };
    store.chatSessionState = { "chat:sess-1": status() };
    registerChatAgent({
      id: "chat:sess-1",
      workspaceId: "a",
      title: "Live title",
      kind: "chat",
      isAgent: true,
      activity: "working",
      needsAttention: false,
      stale: false,
      canResume: true,
      sessionId: "sess-1",
      chatResumeState: "live",
    });

    syncDormantChatSessions();

    expect(chatAgentInfos()).toHaveLength(1);
    expect(chatAgentInfos()[0]).toMatchObject({
      title: "Live title",
      chatResumeState: "live",
    });
  });

  it("withdraws its entry when the panel record goes away", () => {
    store.workspaces = {
      a: ws("a", [chatPanel("p1", "a", { sessionId: "sess-1" })]),
    };
    store.chatSessionState = { "chat:sess-1": status() };
    syncDormantChatSessions();
    expect(chatAgentInfos()).toHaveLength(1);

    store.workspaces = { a: ws("a") };
    syncDormantChatSessions();

    expect(chatAgentInfos()).toEqual([]);
  });

  it("registers nothing before the store is hydrated", () => {
    store.hydrated = false;
    store.workspaces = {
      a: ws("a", [chatPanel("p1", "a", { sessionId: "sess-1" })]),
    };
    store.chatSessionState = { "chat:sess-1": status() };

    syncDormantChatSessions();

    expect(chatAgentInfos()).toEqual([]);
  });
});

describe("startChatSessionStatusPersistence — the write half", () => {
  it("mirrors a live session's identity into the store as it changes", () => {
    startChatSessionStatusPersistence();
    registerChatAgent({
      id: "chat:sess-1",
      workspaceId: "a",
      title: "Refactor the dock registry",
      kind: "chat",
      isAgent: true,
      activity: "idle",
      needsAttention: false,
      stale: false,
      canResume: true,
      sessionId: "sess-1",
      agentName: "Claude Code",
      agentId: "claude",
      chatResumeState: "live",
    });

    expect(store.chatSessionState["chat:sess-1"]).toMatchObject({
      workspaceId: "a",
      sessionId: "sess-1",
      title: "Refactor the dock registry",
      agentName: "Claude Code",
      agentId: "claude",
      canResume: true,
    });

    patchChatAgent("chat:sess-1", { title: "Fix the dock panel merge" });
    expect(store.chatSessionState["chat:sess-1"].title).toBe(
      "Fix the dock panel merge",
    );
  });

  it("writes nothing for a Terminal session", () => {
    startChatSessionStatusPersistence();
    registerChatAgent({
      id: "term-1",
      workspaceId: "a",
      title: "zsh",
      kind: "terminal",
      isAgent: true,
      activity: "idle",
      needsAttention: false,
      stale: false,
      canResume: false,
    });
    expect(store.chatSessionState).toEqual({});
  });
});

describe("pruneOrphanedChatSessionStatuses", () => {
  it("drops a status whose panel is gone and keeps one still referenced", () => {
    store.workspaces = {
      a: ws("a", [chatPanel("p1", "a", { sessionId: "sess-1" })]),
    };
    store.chatSessionState = {
      "chat:sess-1": status(),
      "chat:sess-gone": status({ sessionId: "sess-gone" }),
    };

    pruneOrphanedChatSessionStatuses();

    expect(Object.keys(store.chatSessionState)).toEqual(["chat:sess-1"]);
  });
});

// Dave's report (2026-09-10), comparing screenshots either side of a restart:
// an agent that read "Ready · 11s" with a green dot came back "Idle · 2s" and
// grey. Identity was restored; *status* was thrown away and the clock reset.
describe("restoredActivity — the status a restart must not invent", () => {
  it("keeps a finished-unseen agent flagged, with its original timestamp", () => {
    expect(
      restoredActivity(
        status({
          activity: "idle",
          needsAttention: true,
          attentionSince: "2026-09-10T12:00:00.000Z",
        }),
      ),
    ).toEqual({
      activity: "idle",
      needsAttention: true,
      attentionSince: "2026-09-10T12:00:00.000Z",
      stale: false,
    });
  });

  it("brings a mid-turn agent back idle and stale, never as a spinner", () => {
    expect(restoredActivity(status({ activity: "working" }))).toEqual({
      activity: "idle",
      needsAttention: false,
      stale: true,
    });
  });

  it("does not carry over a dead or errored process — there is no process yet", () => {
    expect(restoredActivity(status({ activity: "dead" })).activity).toBe(
      "idle",
    );
    expect(restoredActivity(status({ activity: "error" })).activity).toBe(
      "idle",
    );
  });

  it("persists attention so the next run can restore it", () => {
    const live: AgentInfo = {
      id: "chat:sess-1",
      workspaceId: "a",
      title: "t",
      kind: "chat",
      isAgent: true,
      activity: "idle",
      needsAttention: true,
      attentionSince: "2026-09-10T12:00:00.000Z",
      stale: false,
      canResume: true,
      sessionId: "sess-1",
      chatResumeState: "live",
    };
    expect(chatSessionStatus(live, "now")).toMatchObject({
      needsAttention: true,
      attentionSince: "2026-09-10T12:00:00.000Z",
    });
  });

  it("a status change counts attention, so it is actually written", () => {
    const prev = status();
    expect(
      chatSessionStatusChanged(prev, { ...prev, needsAttention: true }),
    ).toBe(true);
    expect(
      chatSessionStatusChanged(prev, { ...prev, activity: "working" }),
    ).toBe(true);
  });
});

// The tab's own chrome — the agent's brand icon and its activity badge —
// resolves through the panel→session map, which only a *mounted* panel used to
// write. A restored tab therefore sat blank until its agent connected.
describe("the restored tab's own binding", () => {
  it("declares which session a recorded tab is showing before anything mounts", () => {
    store.workspaces = {
      a: ws("a", [chatPanel("p1", "a", { sessionId: "sess-1" })]),
    };
    store.chatSessionState = { "chat:sess-1": status() };

    syncDormantChatSessions();

    expect(agentSessionForPanel("acp-chat:p1")).toBe("chat:sess-1");
  });

  it("withdraws the binding when the record goes away", () => {
    store.workspaces = {
      a: ws("a", [chatPanel("p1", "a", { sessionId: "sess-1" })]),
    };
    store.chatSessionState = { "chat:sess-1": status() };
    syncDormantChatSessions();

    store.workspaces = { a: ws("a") };
    syncDormantChatSessions();

    expect(agentSessionForPanel("acp-chat:p1")).toBeUndefined();
  });
});

// An agent keeps its sessions inside its config directory, which it reads from
// an env var Silo inherits from whatever launched it. Recording the directory a
// session was created in is what makes a restore independent of how Silo was
// started this time (2026-09-10: a real conversation was declared unresumable
// purely because the app had been relaunched from a different shell).
describe("noteChatSessionConfigDir", () => {
  it("stamps the store a session lives in onto its status", () => {
    store.chatSessionState = { "chat:sess-1": status() };
    noteChatSessionConfigDir("chat:sess-1", "/Users/dave/.claude-work");
    expect(store.chatSessionState["chat:sess-1"].configDir).toBe(
      "/Users/dave/.claude-work",
    );
  });

  it("is carried forward by later status updates rather than dropped", () => {
    const prior = status({ configDir: "/Users/dave/.claude-work" });
    const live: AgentInfo = {
      id: "chat:sess-1",
      workspaceId: "a",
      title: "New title",
      kind: "chat",
      isAgent: true,
      activity: "idle",
      needsAttention: false,
      stale: false,
      canResume: true,
      sessionId: "sess-1",
      chatResumeState: "live",
    };
    expect(chatSessionStatus(live, "now", prior)?.configDir).toBe(
      "/Users/dave/.claude-work",
    );
  });

  it("ignores an unknown session and an empty value", () => {
    store.chatSessionState = {};
    noteChatSessionConfigDir("chat:nope", "/x");
    noteChatSessionConfigDir("chat:sess-1", undefined);
    expect(store.chatSessionState).toEqual({});
  });
});

// A connect that fails — a missing binary, an auth wall — removes the
// registration it made. Without a floor to fall back to, the session
// disappears from the navigator entirely: tab still open, conversation still
// on disk, no row anywhere. Seen live 2026-09-10 (`failed to spawn npx`).
describe("a failed connect falls back to the dormant row", () => {
  it("re-registers after the live entry is removed", () => {
    store.workspaces = {
      a: ws("a", [chatPanel("p1", "a", { sessionId: "sess-1" })]),
    };
    store.chatSessionState = { "chat:sess-1": status() };
    syncDormantChatSessions();
    expect(chatAgentInfos()).toHaveLength(1);

    // What `connect()` does when its handshake throws.
    removeChatAgent("chat:sess-1");
    expect(chatAgentInfos()).toEqual([]);

    syncDormantChatSessions();

    expect(chatAgentInfos()).toEqual([
      expect.objectContaining({
        id: "chat:sess-1",
        chatResumeState: "dormant",
      }),
    ]);
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the Tauri invoke used for the foreground-snapshot seed — resolve to
// null (no snapshot) by default so it's a no-op unless a test overrides it.
const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

// Mock terminal-service's OSC/output/active surface so tests can fire
// per-terminal callbacks directly instead of driving a real PTY.
const { subscribeOsc, subscribeOutput, getActive } = vi.hoisted(() => ({
  subscribeOsc: vi.fn(),
  subscribeOutput: vi.fn(),
  getActive: vi.fn(() => null as string | null),
}));
vi.mock("./terminal-service", () => ({
  getTerminalService: () => ({ subscribeOsc, subscribeOutput, getActive }),
}));

// Mock terminal-foreground so tests can fire foreground ticks (atPrompt/
// leader) directly instead of a real Tauri event.
const { onTerminalForeground } = vi.hoisted(() => ({
  onTerminalForeground: vi.fn(),
}));
vi.mock("./terminal-foreground", () => ({ onTerminalForeground }));

const { homeDir } = vi.hoisted(() => ({
  homeDir: vi.fn(() => Promise.resolve("/Users/test")),
}));
vi.mock("./platform", () => ({ homeDir }));

// Skip the hook-events file consume entirely — irrelevant to activity-state
// tests and would otherwise do a real file read / start a watch.
vi.mock("./agent-hook-events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./agent-hook-events")>();
  return {
    ...actual,
    readNewHookEvents: vi.fn(() => Promise.resolve([])),
    resolveAgentHooksDir: vi.fn(() =>
      Promise.resolve("/tmp/.silo/agent-hooks"),
    ),
    pruneAgentHooksEventsFile: vi.fn(() =>
      Promise.resolve({ before: 0, after: 0 }),
    ),
  };
});
const { startWatch, stopWatch, onFileChange, fileChangeListeners } = vi.hoisted(
  () => {
    const fileChangeListeners = new Set<
      (evt: { watchId: string; paths: string[]; kind: string }) => void
    >();
    return {
      fileChangeListeners,
      startWatch: vi.fn(() => Promise.resolve()),
      stopWatch: vi.fn(() => Promise.resolve()),
      onFileChange: vi.fn(
        (
          cb: (evt: { watchId: string; paths: string[]; kind: string }) => void,
        ) => {
          fileChangeListeners.add(cb);
          return Promise.resolve(() => fileChangeListeners.delete(cb));
        },
      ),
    };
  },
);
vi.mock("../services/tauri-watch", () => ({
  startWatch,
  stopWatch,
  onFileChange,
}));

function emitSessionFileChange() {
  const watchId = "silo-agent-session-file:/Users/test/.grok";
  for (const cb of fileChangeListeners) {
    cb({
      watchId,
      paths: ["/Users/test/.grok/active_sessions.json"],
      kind: "modify",
    });
  }
}
import { store } from "../state/store";
import type { WorkspaceInternal } from "../state/types";
import { getAgentsService } from "./agents-service";
import { AGENT_IDLE_DEBOUNCE_MS } from "./agent-detection-dispatch";

const svc = getAgentsService();

type OscCallback = (ev: { code: number; payload: string }) => void;
type FgCallback = (fg: {
  pgid: number;
  atPrompt: boolean;
  leader: string;
  cwd: string;
}) => void;

const oscCallbacks = new Map<string, OscCallback>();
const fgCallbacks = new Map<string, FgCallback>();

function makeWorkspace(id: string): WorkspaceInternal {
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

beforeEach(() => {
  vi.useFakeTimers();
  invoke.mockReset().mockResolvedValue(null);
  homeDir.mockReset().mockResolvedValue("/Users/test");
  getActive.mockReset().mockReturnValue(null);
  oscCallbacks.clear();
  fgCallbacks.clear();

  subscribeOsc
    .mockReset()
    .mockImplementation((terminalId: string, cb: OscCallback) => {
      oscCallbacks.set(terminalId, cb);
      return { dispose: () => oscCallbacks.delete(terminalId) };
    });
  subscribeOutput.mockReset().mockImplementation(() => ({ dispose: () => {} }));
  onTerminalForeground
    .mockReset()
    .mockImplementation((sessionId: string, cb: FgCallback) => {
      fgCallbacks.set(sessionId, cb);
      return () => fgCallbacks.delete(sessionId);
    });

  store.workspaces = {};
  store.workspaceOrder = [];
  store.activeWorkspaceId = null;
  store.agentState = {};
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AgentsService — Grok session-file resume", () => {
  it("resolves grok --resume from the session file when the foreground is grok", async () => {
    const id = "t-grok";
    const sessionId = "sess-grok";
    const grokPgid = 94122;
    const grokSession = "019faf7c-714e-7f73-892d-ba57cd52a72e";

    invoke.mockImplementation((cmd: string, args?: { path?: string }) => {
      if (
        cmd === "fs_read_text" &&
        args?.path?.endsWith(".grok/active_sessions.json")
      ) {
        return Promise.resolve(
          JSON.stringify([
            { session_id: grokSession, pid: grokPgid, cwd: "/tmp" },
          ]),
        );
      }
      return Promise.resolve(null);
    });

    await attachTerminal(id, sessionId);
    foreground(sessionId, {
      pgid: grokPgid,
      atPrompt: false,
      leader: "grok",
      cwd: "/tmp",
    });

    // Flush the immediate (0ms) session-file read + its async homeDir/invoke.
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();

    const info = svc.getByTerminalId(id);
    expect(info?.agentId).toBe("grok");
    expect(info?.agentName).toBe("Grok");
    expect(info?.sessionId).toBe(grokSession);
    expect(info?.resumeCommand).toBe(`grok --resume ${grokSession}`);
  });

  it("corrects a Claude-tagged identity when the session file resolves for Grok", async () => {
    const id = "t-grok-correct";
    const sessionId = "sess-grok-correct";
    const grokPgid = 58782;
    const grokSession = "019faf38-fd33-73d2-be89-c14f8f29f315";

    // Simulate the Claude-compat race: a foreign hook already stamped Claude
    // onto this terminal before the Grok foreground + session-file read.
    store.agentState[id] = {
      workspaceId: `ws-${id}`,
      isAgent: true,
      activity: "idle",
      needsAttention: false,
      workingSource: null,
      sessionId: grokSession,
      resumeCommand: `claude --resume ${grokSession}`,
      agentId: "claude",
      agentName: "Claude Code",
      lastLiveAt: "2026-07-29T18:52:56.000Z",
    };

    invoke.mockImplementation((cmd: string, args?: { path?: string }) => {
      if (
        cmd === "fs_read_text" &&
        args?.path?.endsWith(".grok/active_sessions.json")
      ) {
        return Promise.resolve(
          JSON.stringify([
            { session_id: grokSession, pid: grokPgid, cwd: "/tmp" },
          ]),
        );
      }
      return Promise.resolve(null);
    });

    await attachTerminal(id, sessionId);
    expect(svc.getByTerminalId(id)?.agentId).toBe("claude");

    foreground(sessionId, {
      pgid: grokPgid,
      atPrompt: false,
      leader: "grok",
      cwd: "/tmp",
    });
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();

    const info = svc.getByTerminalId(id);
    expect(info?.agentId).toBe("grok");
    expect(info?.agentName).toBe("Grok");
    expect(info?.resumeCommand).toBe(`grok --resume ${grokSession}`);
  });

  it("resolves after a late first-message write via the session-file watch", async () => {
    // Grok only creates a session on the first typed character — the short
    // post-foreground retries finish empty; the ~/.grok watch must pick it up.
    const id = "t-grok-late";
    const sessionId = "sess-grok-late";
    const grokPgid = 77777;
    const grokSession = "019faf99-late-session-id-000000000001";
    let fileText: string | null = null;

    invoke.mockImplementation((cmd: string, args?: { path?: string }) => {
      if (
        cmd === "fs_read_text" &&
        args?.path?.endsWith(".grok/active_sessions.json")
      ) {
        if (fileText == null) return Promise.reject(new Error("ENOENT"));
        return Promise.resolve(fileText);
      }
      return Promise.resolve(null);
    });

    await attachTerminal(id, sessionId);
    foreground(sessionId, {
      pgid: grokPgid,
      atPrompt: false,
      leader: "grok",
      cwd: "/tmp",
    });
    // Exhaust the short post-foreground retries — still no session on disk.
    await vi.advanceTimersByTimeAsync(3000);
    await Promise.resolve();
    await Promise.resolve();

    expect(svc.getByTerminalId(id)?.sessionId).toBeUndefined();

    // User types in Grok → registry write → file watch fires.
    fileText = JSON.stringify([
      { session_id: grokSession, pid: grokPgid, cwd: "/tmp" },
    ]);
    emitSessionFileChange();
    await Promise.resolve();
    await Promise.resolve();

    const info = svc.getByTerminalId(id);
    expect(info?.sessionId).toBe(grokSession);
    expect(info?.agentId).toBe("grok");
    expect(info?.resumeCommand).toBe(`grok --resume ${grokSession}`);
  });

  it("demotes when the session-file entry disappears after exit", async () => {
    const id = "t-grok-exit";
    const sessionId = "sess-grok-exit";
    const grokPgid = 88888;
    const grokSession = "019fafaa-exit-session-id-000000000002";
    let fileText: string = JSON.stringify([
      { session_id: grokSession, pid: grokPgid, cwd: "/tmp" },
    ]);

    invoke.mockImplementation((cmd: string, args?: { path?: string }) => {
      if (
        cmd === "fs_read_text" &&
        args?.path?.endsWith(".grok/active_sessions.json")
      ) {
        return Promise.resolve(fileText);
      }
      return Promise.resolve(null);
    });

    await attachTerminal(id, sessionId);
    // Promote via braille so isAgent is true (session-file alone doesn't).
    osc(id, 0, "⠀");
    expect(svc.getByTerminalId(id)?.isAgent).toBe(true);

    foreground(sessionId, {
      pgid: grokPgid,
      atPrompt: false,
      leader: "grok",
      cwd: "/tmp",
    });
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(svc.getByTerminalId(id)?.sessionId).toBe(grokSession);

    // Grok exits → registry drops this pid.
    fileText = "[]";
    emitSessionFileChange();
    await Promise.resolve();
    await Promise.resolve();

    const info = svc.getByTerminalId(id);
    expect(info?.isAgent).toBe(false);
    expect(info?.sessionId).toBeUndefined();
    expect(info?.agentId).toBeUndefined();
    expect(info?.activity).toBe("none");
  });
});

function osc(terminalId: string, code: number, payload: string) {
  oscCallbacks.get(terminalId)?.({ code, payload });
}

function foreground(
  sessionId: string,
  fg: { pgid: number; atPrompt: boolean; leader: string; cwd?: string },
) {
  fgCallbacks.get(sessionId)?.({ cwd: "", ...fg });
}

/**
 * Attach a fresh terminal (own workspace, own id/sessionId per test so the
 * module-level `sessions` Map — a singleton that outlives any one test —
 * never carries state over between cases). `agents-service.ts` syncs its
 * session tracking off a `subscribe(store, syncSessions)` valtio
 * subscription, which batches notifications onto a microtask (`notifyInSync`
 * defaults to false) — so callers must await this before the terminal's OSC/
 * foreground callbacks are registered.
 */
async function attachTerminal(id: string, sessionId: string) {
  const ws = makeWorkspace(`ws-${id}`);
  ws.terminals = [{ id, sessionId, kind: "shell", title: "Terminal" }];
  store.workspaces = { ...store.workspaces, [ws.id]: ws };
  if (!store.workspaceOrder.includes(ws.id)) store.workspaceOrder.push(ws.id);
  store.activeWorkspaceId = ws.id;
  await Promise.resolve();
  await Promise.resolve();
}

describe("AgentsService — demotion cancels pending agent-idle debounce", () => {
  it("does not let a stale queued agent-idle timer re-promote isAgent after the shell reclaims the prompt", async () => {
    await attachTerminal("t1", "sess-1");
    // The terminal being actively viewed is what makes checkPromptDemotion's
    // "waiting" transition land as isActiveTerminal: true — needsAttention
    // stays false, which is what actually lets the isAgent demotion fire
    // (see reduce()'s `!needsAttention` gate).
    getActive.mockReturnValue("t1");

    // Claude's braille spinner promotes this plain shell to isAgent: true,
    // activity: "working".
    osc("t1", 0, "⠀");
    expect(svc.getByTerminalId("t1")?.isAgent).toBe(true);
    expect(svc.getByTerminalId("t1")?.activity).toBe("working");

    // Claude's "✳" idle marker between tool calls only *arms* the 1.5s
    // agent-idle debounce — it doesn't dispatch immediately (see
    // planDetection). If the user exits right after this, the timer is
    // still pending when the shell reclaims the terminal.
    osc("t1", 0, "✳ done");
    expect(svc.getByTerminalId("t1")?.activity).toBe("working");

    // The shell's foreground poll now reports atPrompt: true (Claude
    // exited) — this is the real, confirmed demotion path.
    foreground("sess-1", { pgid: 123, atPrompt: true, leader: "/bin/zsh" });
    expect(svc.getByTerminalId("t1")?.isAgent).toBe(false);

    // Advance past AGENT_IDLE_DEBOUNCE_MS: the stale timer armed above must
    // have been cancelled by the demotion — it must NOT fire and flip
    // isAgent back to true.
    vi.advanceTimersByTime(AGENT_IDLE_DEBOUNCE_MS);
    expect(svc.getByTerminalId("t1")?.isAgent).toBe(false);
  });

  it("does not let a stale queued agent-idle timer re-promote isAgent after an ordinary shell-integration prompt-start", async () => {
    await attachTerminal("t2", "sess-2");
    getActive.mockReturnValue("t2");

    osc("t2", 0, "⠀"); // working
    osc("t2", 0, "✳ done"); // arms the agent-idle debounce
    expect(svc.getByTerminalId("t2")?.isAgent).toBe(true);

    // OSC 133;A (shell prompt start) is the other path that can demote —
    // fired directly on the OSC stream rather than via the foreground poll.
    osc("t2", 133, "A");
    expect(svc.getByTerminalId("t2")?.isAgent).toBe(false);

    vi.advanceTimersByTime(AGENT_IDLE_DEBOUNCE_MS);
    expect(svc.getByTerminalId("t2")?.isAgent).toBe(false);
  });

  it("still allows a genuinely new agent invocation to re-promote isAgent afterward", async () => {
    await attachTerminal("t3", "sess-3");
    getActive.mockReturnValue("t3");

    osc("t3", 0, "⠀");
    osc("t3", 0, "✳ done");
    foreground("sess-3", { pgid: 123, atPrompt: true, leader: "/bin/zsh" });
    expect(svc.getByTerminalId("t3")?.isAgent).toBe(false);

    // A fresh `claude` invocation in the same terminal must still promote
    // normally — the fix only cancels the *stale* timer at demotion time,
    // it doesn't block future detections.
    osc("t3", 0, "⠀");
    expect(svc.getByTerminalId("t3")?.isAgent).toBe(true);
    expect(svc.getByTerminalId("t3")?.activity).toBe("working");
  });

  it("demotes on shell reclaim even when needsAttention was pending", async () => {
    // reduce() gates shell demotion on !needsAttention so a stray OSC 133
    // doesn't wipe an unread idle — but an OS-level atPrompt reclaim means
    // the agent process is gone, so checkPromptDemotion must still demote.
    const id = "t-exit-with-attn";
    const sessionId = "sess-exit-with-attn";
    await attachTerminal(id, sessionId);
    getActive.mockReturnValue(null); // unfocused → idle sets needsAttention

    osc(id, 0, "⠀");
    osc(id, 0, "✳ done");
    vi.advanceTimersByTime(AGENT_IDLE_DEBOUNCE_MS);
    expect(svc.getByTerminalId(id)?.isAgent).toBe(true);
    expect(svc.getByTerminalId(id)?.needsAttention).toBe(true);

    foreground(sessionId, { pgid: 1, atPrompt: true, leader: "/bin/zsh" });
    expect(svc.getByTerminalId(id)?.isAgent).toBe(false);
    expect(svc.getByTerminalId(id)?.needsAttention).toBe(false);
    expect(svc.getByTerminalId(id)?.activity).toBe("none");
  });
});

describe("AgentsService — restored acknowledged idle does not re-flag attention", () => {
  it("swallows the first post-restore working→idle, then flags a later real turn", async () => {
    const id = "t-restored-idle";
    const sessionId = "sess-restored-idle";
    // Simulate a prior session the user already acknowledged before restart.
    store.agentState[id] = {
      workspaceId: `ws-${id}`,
      isAgent: true,
      activity: "idle",
      needsAttention: false,
      workingSource: null,
      agentId: "claude",
      agentName: "Claude Code",
      lastLiveAt: "2026-07-28T19:00:00.000Z",
    };

    await attachTerminal(id, sessionId);
    getActive.mockReturnValue(null); // not the focused tab
    expect(svc.getByTerminalId(id)?.needsAttention).toBe(false);
    expect(svc.getByTerminalId(id)?.activity).toBe("idle");

    // Reattach redraw: braille → ✳ debounce → idle. Must not look like a
    // brand-new finished turn the user hasn't seen.
    osc(id, 0, "⠀");
    expect(svc.getByTerminalId(id)?.activity).toBe("working");
    osc(id, 0, "✳ done");
    vi.advanceTimersByTime(AGENT_IDLE_DEBOUNCE_MS);
    expect(svc.getByTerminalId(id)?.activity).toBe("idle");
    expect(svc.getByTerminalId(id)?.needsAttention).toBe(false);

    // A later real turn while still unfocused should raise attention.
    osc(id, 0, "⠀");
    expect(svc.getByTerminalId(id)?.activity).toBe("working");
    osc(id, 0, "✳ done");
    vi.advanceTimersByTime(AGENT_IDLE_DEBOUNCE_MS);
    expect(svc.getByTerminalId(id)?.activity).toBe("idle");
    expect(svc.getByTerminalId(id)?.needsAttention).toBe(true);
  });

  it("does not suppress when restore still had needsAttention pending", async () => {
    const id = "t-restored-attn";
    const sessionId = "sess-restored-attn";
    store.agentState[id] = {
      workspaceId: `ws-${id}`,
      isAgent: true,
      activity: "idle",
      needsAttention: true,
      attentionSince: "2026-07-28T18:00:00.000Z",
      workingSource: null,
      agentId: "claude",
      agentName: "Claude Code",
      lastLiveAt: "2026-07-28T18:00:00.000Z",
    };

    await attachTerminal(id, sessionId);
    expect(svc.getByTerminalId(id)?.needsAttention).toBe(true);

    // working→idle while unfocused should keep/refresh attention (guard off).
    getActive.mockReturnValue(null);
    osc(id, 0, "⠀");
    osc(id, 0, "✳ done");
    vi.advanceTimersByTime(AGENT_IDLE_DEBOUNCE_MS);
    expect(svc.getByTerminalId(id)?.needsAttention).toBe(true);
  });
});

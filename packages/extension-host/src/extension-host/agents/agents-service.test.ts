import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Mock the Tauri invoke used for the foreground-snapshot seed — resolve to
// null (no snapshot) by default so it's a no-op unless a test overrides it.
const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

// Mock terminal-service's OSC/output/active surface so tests can fire
// per-terminal callbacks directly instead of driving a real PTY.
const { subscribeOsc, subscribeOutput, getActive, focus } = vi.hoisted(() => ({
  subscribeOsc: vi.fn(),
  subscribeOutput: vi.fn(),
  getActive: vi.fn(() => null as string | null),
  focus: vi.fn(),
}));
const { close } = vi.hoisted(() => ({ close: vi.fn() }));
vi.mock("../terminal-service", () => ({
  getTerminalService: () => ({
    subscribeOsc,
    subscribeOutput,
    getActive,
    focus,
    close,
  }),
}));

// Mock terminal-foreground so tests can fire foreground ticks (atPrompt/
// leader) directly instead of a real Tauri event.
const { onTerminalForeground } = vi.hoisted(() => ({
  onTerminalForeground: vi.fn(),
}));
vi.mock("../terminal-foreground", () => ({ onTerminalForeground }));

const { homeDir } = vi.hoisted(() => ({
  homeDir: vi.fn(() => Promise.resolve("/Users/test")),
}));
vi.mock("../platform", () => ({ homeDir }));

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
vi.mock("../../services/tauri-watch", () => ({
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
import { store } from "../../state/store";
import type { WorkspaceInternal } from "../../state/types";
import { getAgentsService, notifyTerminalSessionGone } from "./agents-service";
import {
  patchChatAgent,
  registerChatAgent,
  resetChatAgentRegistry,
} from "./chat-agent-registry";
import { AGENT_IDLE_DEBOUNCE_MS } from "./agent-detection-dispatch";
import {
  _resetAgentSurfaceRegistryForTests,
  setActiveDockPanel,
  setPanelAgentSession,
} from "./agent-surface-registry";
import { setActiveTerminal } from "../active-terminal-registry";
import { tabAdornmentRegistry } from "../tab-adornment-registry";
import { readNewHookEvents } from "./agent-hook-events";

const readNewHookEventsMock = vi.mocked(readNewHookEvents);

const svc = getAgentsService();

type OscCallback = (
  ev: { code: number; payload: string },
  origin: { replay: boolean },
) => void;
type OutputCallback = (chunk: string, origin: { replay: boolean }) => void;
type FgCallback = (fg: {
  pgid: number;
  atPrompt: boolean;
  leader: string;
  cwd: string;
}) => void;

const oscCallbacks = new Map<string, OscCallback>();
const outputCallbacks = new Map<string, OutputCallback>();
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
  close.mockReset();
  readNewHookEventsMock.mockReset().mockResolvedValue([]);
  oscCallbacks.clear();
  outputCallbacks.clear();
  fgCallbacks.clear();

  subscribeOsc
    .mockReset()
    .mockImplementation((terminalId: string, cb: OscCallback) => {
      oscCallbacks.set(terminalId, cb);
      return { dispose: () => oscCallbacks.delete(terminalId) };
    });
  subscribeOutput
    .mockReset()
    .mockImplementation((terminalId: string, cb: OutputCallback) => {
      outputCallbacks.set(terminalId, cb);
      return { dispose: () => outputCallbacks.delete(terminalId) };
    });
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

describe("AgentsService — promotion from the foreground leader alone", () => {
  // Windows has no hooks (the script is POSIX shell) and no guarantee of an
  // OSC promotion, so the foreground leader is the only evidence available.
  // Before this, such a terminal was tracked and correctly named but stayed
  // isAgent: false — and every consumer that shows "agent terminals" filters
  // on isAgent, so a working Copilot session was invisible.
  it("promotes a shell to an agent when a known agent is the foreground leader", async () => {
    const id = "t-fg-promote";
    const sessionId = "sess-fg-promote";

    await attachTerminal(id, sessionId);
    expect(svc.getByTerminalId(id)?.isAgent).toBe(false);

    // No hook event, no OSC — just the leader, as on Windows.
    foreground(sessionId, {
      pgid: 9560,
      atPrompt: false,
      leader: "copilot.exe",
      cwd: "",
    });

    const info = svc.getByTerminalId(id);
    expect(info?.isAgent).toBe(true);
    expect(info?.agentId).toBe("copilot");
    expect(info?.agentName).toBe("GitHub Copilot CLI");
  });

  it("leaves a plain shell alone", async () => {
    const id = "t-fg-shell";
    const sessionId = "sess-fg-shell";

    await attachTerminal(id, sessionId);
    foreground(sessionId, {
      pgid: 3732,
      atPrompt: true,
      leader: "cmd.exe",
      cwd: "",
    });

    expect(svc.getByTerminalId(id)?.isAgent).toBe(false);
  });

  it("does not re-promote on every tick once it is already an agent", async () => {
    // The Windows walk reports a new leader roughly once a second while an
    // agent shells out (git, where, powershell), so this path is hot.
    const id = "t-fg-repeat";
    const sessionId = "sess-fg-repeat";

    await attachTerminal(id, sessionId);
    for (let i = 0; i < 3; i++) {
      foreground(sessionId, {
        pgid: 9560,
        atPrompt: false,
        leader: "copilot.exe",
        cwd: "",
      });
    }

    const info = svc.getByTerminalId(id);
    expect(info?.isAgent).toBe(true);
    expect(info?.agentId).toBe("copilot");
  });
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

  it("re-resolves for a new grok process in the same terminal (quit + rerun, pgid change)", async () => {
    // Reproduces the reported flake: run grok, quit, run again fast enough that
    // the foreground poll never saw the shell prompt in between — so the
    // terminal never demoted and kept run 1's session id. Run 2's id must
    // still be picked up (the stale id is cleared on the pgid change), not
    // rejected as a duplicate.
    const id = "t-grok-rerun";
    const sessionId = "sess-grok-rerun";
    const pgidA = 55501;
    const pgidB = 55599; // a genuinely new grok process
    const sA = "019faf38-1111-7f73-892d-ba57cd52a72e";
    const sB = "019faf3b-2222-7723-b1c9-bc2b698c0748";

    invoke.mockImplementation((cmd: string, args?: { path?: string }) => {
      if (
        cmd === "fs_read_text" &&
        args?.path?.endsWith(".grok/active_sessions.json")
      ) {
        return Promise.resolve(
          JSON.stringify([
            { session_id: sA, pid: pgidA, cwd: "/tmp" },
            { session_id: sB, pid: pgidB, cwd: "/tmp" },
          ]),
        );
      }
      return Promise.resolve(null);
    });

    await attachTerminal(id, sessionId);

    // Run 1.
    foreground(sessionId, {
      pgid: pgidA,
      atPrompt: false,
      leader: "grok",
      cwd: "/tmp",
    });
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(svc.getByTerminalId(id)?.sessionId).toBe(sA);

    // Run 2 — new grok process (new pgid), no shell tick in between.
    foreground(sessionId, {
      pgid: pgidB,
      atPrompt: false,
      leader: "grok",
      cwd: "/tmp",
    });
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();

    const info = svc.getByTerminalId(id);
    expect(info?.sessionId).toBe(sB); // not the stale sA
    expect(info?.resumeCommand).toBe(`grok --resume ${sB}`);
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

    // Grok exits → registry drops this pid. Demotes to a non-agent, but the
    // resume identity is PRESERVED (this is the "session ended, resume with…"
    // moment; a reboot has no at-prompt reclaim to follow, so keeping it is
    // what lets the reboot-resume box surface it later).
    fileText = "[]";
    emitSessionFileChange();
    await Promise.resolve();
    await Promise.resolve();

    const gone = svc.getByTerminalId(id);
    expect(gone?.isAgent).toBe(false);
    expect(gone?.activity).toBe("none");
    expect(gone?.sessionId).toBe(grokSession);
    expect(gone?.resumeCommand).toBe(`grok --resume ${grokSession}`);

    // The shell then reclaims its prompt (clean-exit path): now the shell is
    // confirmed live, so the stale hint is cleared.
    foreground(sessionId, {
      pgid: 99999,
      atPrompt: true,
      leader: "/bin/zsh",
      cwd: "/tmp",
    });
    await Promise.resolve();
    await Promise.resolve();

    const cleared = svc.getByTerminalId(id);
    expect(cleared?.isAgent).toBe(false);
    expect(cleared?.sessionId).toBeUndefined();
    expect(cleared?.agentId).toBeUndefined();
    expect(cleared?.resumeCommand).toBeUndefined();
  });

  it("keeps the resume identity through a session-file drop so a reboot death still surfaces it", async () => {
    // Reboot scenario: Grok's registry entry drops as the process is killed,
    // but no at-prompt reclaim follows (the app dies). The preserved resume
    // identity must let markSessionDead surface the resume box.
    const id = "t-grok-reboot";
    const sessionId = "sess-grok-reboot";
    const grokPgid = 77777;
    const grokSession = "019fafbb-reboot-session-id-00000000003";
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
    osc(id, 0, "⠀"); // promote via braille
    foreground(sessionId, {
      pgid: grokPgid,
      atPrompt: false,
      leader: "grok",
      cwd: "/tmp",
    });
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(svc.getByTerminalId(id)?.resumeCommand).toBe(
      `grok --resume ${grokSession}`,
    );

    // Registry drop with NO at-prompt reclaim after it (reboot).
    fileText = "[]";
    emitSessionFileChange();
    await Promise.resolve();
    await Promise.resolve();
    expect(svc.getByTerminalId(id)?.resumeCommand).toBe(
      `grok --resume ${grokSession}`,
    );

    // The PTY is confirmed gone (SESSION_GONE) — the resume identity survived
    // to here, so the terminal goes "dead" WITH the resume command (what the
    // TerminalPanel box renders).
    notifyTerminalSessionGone(id);
    await Promise.resolve();

    const dead = svc.getByTerminalId(id);
    expect(dead?.activity).toBe("dead");
    expect(dead?.resumeCommand).toBe(`grok --resume ${grokSession}`);
    expect(dead?.sessionId).toBe(grokSession);
  });

  it("does not re-stamp a session id from a pending timer after demotion", async () => {
    const id = "t-grok-timer-demote";
    const sessionId = "sess-grok-timer-demote";
    const grokPgid = 66666;
    const grokSession = "019fafbb-timer-demote-session-00000003";
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
    getActive.mockReturnValue(id);
    osc(id, 0, "⠀");
    foreground(sessionId, {
      pgid: grokPgid,
      atPrompt: false,
      leader: "grok",
      cwd: "/tmp",
    });
    // Immediate read misses; retries at 600/1500/3000 are still armed.
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();
    expect(svc.getByTerminalId(id)?.sessionId).toBeUndefined();

    // Shell reclaim demotes and must cancel those retries.
    foreground(sessionId, {
      pgid: 1,
      atPrompt: true,
      leader: "/bin/zsh",
      cwd: "/tmp",
    });
    expect(svc.getByTerminalId(id)?.isAgent).toBe(false);

    // Session appears on disk after exit — timers must not apply it.
    fileText = JSON.stringify([
      { session_id: grokSession, pid: grokPgid, cwd: "/tmp" },
    ]);
    await vi.advanceTimersByTimeAsync(3000);
    await Promise.resolve();
    await Promise.resolve();

    const info = svc.getByTerminalId(id);
    expect(info?.isAgent).toBe(false);
    expect(info?.sessionId).toBeUndefined();
    expect(info?.agentId).toBeUndefined();
  });

  it("ignores a Claude SessionStart hook when sticky foreground is Grok", async () => {
    const id = "t-grok-hook-reject";
    const sessionId = "sess-grok-hook-reject";
    const grokPgid = 99901;

    invoke.mockImplementation((cmd: string, args?: { path?: string }) => {
      if (
        cmd === "fs_read_text" &&
        args?.path?.endsWith(".grok/active_sessions.json")
      ) {
        return Promise.reject(new Error("ENOENT"));
      }
      return Promise.resolve(null);
    });

    readNewHookEventsMock.mockResolvedValue([
      {
        sessionId: "claude-sess-should-ignore",
        pid: grokPgid,
        agent: "claude",
        cwd: "/tmp",
        timestamp: "2026-07-29T12:00:00.000Z",
      },
    ]);

    await attachTerminal(id, sessionId);
    osc(id, 0, "⠀");
    foreground(sessionId, {
      pgid: grokPgid,
      atPrompt: false,
      leader: "grok",
      cwd: "/tmp",
    });
    // Foreground schedules hook catch-up reads (0 / 500 / 2000ms).
    await vi.advanceTimersByTimeAsync(2000);
    await Promise.resolve();
    await Promise.resolve();

    const info = svc.getByTerminalId(id);
    expect(info?.agentId).not.toBe("claude");
    expect(info?.sessionId).not.toBe("claude-sess-should-ignore");
    expect(info?.resumeCommand).not.toMatch(/^claude --resume/);
  });
});

/**
 * Deliver an OSC sequence to a terminal's detector. `replay` marks it as
 * scrollback the session host replayed on attach rather than something the
 * session just emitted (RFC 0036).
 */
function osc(
  terminalId: string,
  code: number,
  payload: string,
  replay = false,
) {
  oscCallbacks.get(terminalId)?.({ code, payload }, { replay });
}

/** Deliver a raw output chunk to a terminal's detector. See {@link osc}. */
function output(terminalId: string, chunk: string, replay = false) {
  outputCallbacks.get(terminalId)?.(chunk, { replay });
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

describe("AgentsService — Agent Session shape (RFC 0038)", () => {
  it("a Terminal session's id equals its terminalId, kind is 'terminal'", async () => {
    const id = "t-shape";
    await attachTerminal(id, "sess-shape");
    foreground("sess-shape", {
      pgid: 4242,
      atPrompt: false,
      leader: "claude",
      cwd: "",
    });
    const info = svc.getByTerminalId(id);
    expect(info?.id).toBe(id);
    expect(info?.terminalId).toBe(id);
    expect(info?.kind).toBe("terminal");
    expect(info?.canResume).toBe(false); // no exact session id resolved
  });

  it("reveal(id) activates the workspace and focuses the terminal tab", async () => {
    const id = "t-reveal";
    await attachTerminal(id, "sess-reveal");
    focus.mockClear();
    svc.reveal(id);
    expect(focus).toHaveBeenCalledWith(id);
    expect(store.activeWorkspaceId).toBe(`ws-${id}`);
  });

  it("reveal / resume are no-ops for an unknown id", () => {
    focus.mockClear();
    expect(() => svc.reveal("nope")).not.toThrow();
    expect(() => svc.resume("nope")).not.toThrow();
    expect(focus).not.toHaveBeenCalled();
  });
});

describe("AgentsService — Chat sessions (RFC 0038 phase 2)", () => {
  beforeEach(() => resetChatAgentRegistry());
  afterEach(() => resetChatAgentRegistry());

  function chatInfo(id: string, workspaceId: string) {
    return {
      id,
      workspaceId,
      kind: "chat" as const,
      isAgent: true,
      activity: "idle" as const,
      needsAttention: false,
      stale: false,
      canResume: true,
      title: "Claude Code",
      agentName: "Claude Code",
    };
  }

  it("a registered Chat session shows up in getState() with the same shape, no terminal", async () => {
    const ws = makeWorkspace("ws-chat");
    store.workspaces = { ...store.workspaces, [ws.id]: ws };
    store.activeWorkspaceId = ws.id;
    await Promise.resolve();

    registerChatAgent(chatInfo("chat:s1", ws.id));

    const state = svc.getState();
    const chat = state.find((a) => a.id === "chat:s1");
    expect(chat).toMatchObject({ kind: "chat", activity: "idle" });
    expect(chat?.terminalId).toBeUndefined();
    // getByTerminalId never resolves a Chat session
    expect(svc.getByTerminalId("chat:s1")).toBeUndefined();
  });

  it("subscribe() fires when a Chat session's state changes", async () => {
    const ws = makeWorkspace("ws-chat2");
    store.workspaces = { ...store.workspaces, [ws.id]: ws };
    store.activeWorkspaceId = ws.id;
    await Promise.resolve();

    const seen = vi.fn();
    const sub = svc.subscribe(seen);
    registerChatAgent(chatInfo("chat:s2", ws.id));
    patchChatAgent("chat:s2", { activity: "working" });
    expect(seen).toHaveBeenCalled();
    sub.dispose();
  });

  it("acknowledge(id) clears a Chat session's needsAttention", async () => {
    const ws = makeWorkspace("ws-chat3");
    store.workspaces = { ...store.workspaces, [ws.id]: ws };
    store.activeWorkspaceId = ws.id;
    await Promise.resolve();

    registerChatAgent({
      ...chatInfo("chat:s3", ws.id),
      needsAttention: true,
      attentionSince: "2026-01-01T00:00:00Z",
    });
    svc.acknowledge("chat:s3");
    expect(svc.getState().find((a) => a.id === "chat:s3")).toMatchObject({
      needsAttention: false,
    });
  });

  it("reveal(id) activates the Chat session's workspace without touching a terminal", async () => {
    const ws = makeWorkspace("ws-chat4");
    store.workspaces = { ...store.workspaces, [ws.id]: ws };
    if (!store.workspaceOrder.includes(ws.id)) store.workspaceOrder.push(ws.id);
    store.activeWorkspaceId = "ws-other";
    await Promise.resolve();
    focus.mockClear();

    registerChatAgent(chatInfo("chat:s4", ws.id));
    svc.reveal("chat:s4");
    expect(store.activeWorkspaceId).toBe(ws.id);
    expect(focus).not.toHaveBeenCalled();
  });

  // RFC 0038 phase 3: the session's own UI does the focusing, and it can only
  // do so once its workspace is live — so the order matters.
  it("reveal(id) runs the session's reveal control, after activating its workspace", async () => {
    const ws = makeWorkspace("ws-chat4b");
    store.workspaces = { ...store.workspaces, [ws.id]: ws };
    if (!store.workspaceOrder.includes(ws.id)) store.workspaceOrder.push(ws.id);
    store.activeWorkspaceId = "ws-other";
    await Promise.resolve();

    const seen: string[] = [];
    registerChatAgent(chatInfo("chat:s4b", ws.id), {
      reveal: () => seen.push(store.activeWorkspaceId ?? ""),
    });
    svc.reveal("chat:s4b");
    expect(seen).toEqual([ws.id]);
  });

  it("reveal(id) still activates the workspace for a session with no reveal control", async () => {
    const ws = makeWorkspace("ws-chat4c");
    store.workspaces = { ...store.workspaces, [ws.id]: ws };
    if (!store.workspaceOrder.includes(ws.id)) store.workspaceOrder.push(ws.id);
    store.activeWorkspaceId = "ws-other";
    await Promise.resolve();

    registerChatAgent(chatInfo("chat:s4c", ws.id));
    expect(() => svc.reveal("chat:s4c")).not.toThrow();
    expect(store.activeWorkspaceId).toBe(ws.id);
  });

  it("resume(id) runs the resume control only when canResume", async () => {
    const ws = makeWorkspace("ws-chat5");
    store.workspaces = { ...store.workspaces, [ws.id]: ws };
    store.activeWorkspaceId = ws.id;
    await Promise.resolve();

    const resume = vi.fn();
    registerChatAgent(chatInfo("chat:s5", ws.id), { resume });
    svc.resume("chat:s5");
    expect(resume).toHaveBeenCalled();

    resume.mockClear();
    registerChatAgent(
      { ...chatInfo("chat:s6", ws.id), canResume: false },
      { resume },
    );
    svc.resume("chat:s6");
    expect(resume).not.toHaveBeenCalled();
  });
});

describe("AgentsService — pi identity", () => {
  it("promotes a plain shell when pi's OSC 0 title appears", async () => {
    await attachTerminal("t-pi-title", "sess-pi-title");
    osc("t-pi-title", 0, "π - my session - xerro-edit");
    expect(svc.getByTerminalId("t-pi-title")?.isAgent).toBe(true);
    expect(svc.getByTerminalId("t-pi-title")?.agentId).toBe("pi");
  });

  it("stays an agent when pi emits OSC 133 shell zones mid-turn", async () => {
    await attachTerminal("t-pi-133", "sess-pi-133");
    osc("t-pi-133", 0, "π - my session - xerro-edit");
    expect(svc.getByTerminalId("t-pi-133")?.isAgent).toBe(true);
    expect(svc.getByTerminalId("t-pi-133")?.activity).toBe("idle");

    // Pi wraps each assistant/user message in OSC 133;A … 133;C (message
    // zones, not shell prompts). Those must not drive working/idle once
    // identified — that flickers through thinking vs token streaming.
    osc("t-pi-133", 133, "C");
    expect(svc.getByTerminalId("t-pi-133")?.isAgent).toBe(true);
    expect(svc.getByTerminalId("t-pi-133")?.activity).toBe("idle");

    osc("t-pi-133", 133, "A");
    expect(svc.getByTerminalId("t-pi-133")?.isAgent).toBe(true);
    expect(svc.getByTerminalId("t-pi-133")?.activity).toBe("idle");
    expect(svc.getByTerminalId("t-pi-133")?.agentId).toBe("pi");
  });

  it("tracks pi working/idle from OSC 9;4 progress, not message zones", async () => {
    await attachTerminal("t-pi-prog", "sess-pi-prog");
    getActive.mockReturnValue("t-pi-prog");
    osc("t-pi-prog", 0, "π - my session - xerro-edit");
    expect(svc.getByTerminalId("t-pi-prog")?.activity).toBe("idle");

    osc("t-pi-prog", 9, "4;3");
    expect(svc.getByTerminalId("t-pi-prog")?.activity).toBe("working");
    expect(svc.getByTerminalId("t-pi-prog")?.isAgent).toBe(true);

    // Message-zone noise during the turn must not clear working.
    osc("t-pi-prog", 133, "A");
    expect(svc.getByTerminalId("t-pi-prog")?.activity).toBe("working");

    osc("t-pi-prog", 9, "4;0");
    // Agent idle is debounced — advance past AGENT_IDLE_DEBOUNCE_MS.
    vi.advanceTimersByTime(AGENT_IDLE_DEBOUNCE_MS);
    expect(svc.getByTerminalId("t-pi-prog")?.activity).toBe("idle");
  });

  it("sticks node-wrapped pi from the foreground pgid argv", async () => {
    await attachTerminal("t-pi-node", "sess-pi-node");
    invoke.mockImplementation((cmd: string, args?: { args?: string[] }) => {
      if (cmd === "process_exec" && args?.args?.[0] === "-p") {
        return Promise.resolve({
          stdout:
            "node /Users/x/.nvm/lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js -e ./ext.ts",
        });
      }
      return Promise.resolve(null);
    });
    foreground("sess-pi-node", {
      pgid: 4242,
      atPrompt: false,
      leader: "node",
      cwd: "/proj",
    });
    await Promise.resolve();
    const info = svc.getByTerminalId("t-pi-node");
    expect(info?.agentId).toBe("pi");
    expect(info?.resumeCommand).toBe("was running pi in /proj");
  });

  it("sticks Bun-wrapped OMP from the foreground pgid argv", async () => {
    // The gap RFC 0037 / ADR 0051 close: `omp` ships as a Bun script, so its
    // foreground leader is `bun`. Before this, `noteForeground` only read argv
    // for a leader of exactly `node`, and an OMP terminal was never resolved
    // from its process at all.
    await attachTerminal("t-omp-bun", "sess-omp-bun");
    invoke.mockImplementation((cmd: string, args?: { args?: string[] }) => {
      if (cmd === "process_exec" && args?.args?.[0] === "-p") {
        // Verbatim from a live `ps` poll (omp 18.1.10, 2026-09-04).
        return Promise.resolve({ stdout: "bun /Users/x/.bun/bin/omp" });
      }
      return Promise.resolve(null);
    });
    foreground("sess-omp-bun", {
      pgid: 6262,
      atPrompt: false,
      leader: "bun",
      cwd: "/proj",
    });
    await Promise.resolve();
    const info = svc.getByTerminalId("t-omp-bun");
    expect(info?.agentId).toBe("omp");
    expect(info?.agentName).toBe("OMP");
    expect(info?.isAgent).toBe(true);
  });

  it("still reads argv for a node leader — the interpreter set widened, it did not move", async () => {
    await attachTerminal("t-node-still", "sess-node-still");
    invoke.mockImplementation((cmd: string, args?: { args?: string[] }) => {
      if (cmd === "process_exec" && args?.args?.[0] === "-p") {
        return Promise.resolve({
          stdout: "node /Users/x/.nvm/versions/node/v24.19.0/bin/pi",
        });
      }
      return Promise.resolve(null);
    });
    foreground("sess-node-still", {
      pgid: 7373,
      atPrompt: false,
      leader: "node",
      cwd: "/proj",
    });
    await Promise.resolve();
    expect(svc.getByTerminalId("t-node-still")?.agentId).toBe("pi");
  });

  it("does not read argv while the terminal sits at its shell prompt", async () => {
    // The `!atPrompt` guard is unchanged by the widening: a shell that merely
    // has bun somewhere must not trigger a ps read.
    await attachTerminal("t-bun-prompt", "sess-bun-prompt");
    const execCalls: string[] = [];
    invoke.mockImplementation((cmd: string) => {
      execCalls.push(cmd);
      return Promise.resolve(null);
    });
    foreground("sess-bun-prompt", {
      pgid: 8484,
      atPrompt: true,
      leader: "bun",
      cwd: "/proj",
    });
    await Promise.resolve();
    expect(execCalls).not.toContain("process_exec");
    expect(svc.getByTerminalId("t-bun-prompt")?.agentId).toBeFalsy();
  });

  it("identifies an OMP terminal from its title alone, with no process read", async () => {
    // The Windows path, and the plain-shell path before the first foreground
    // tick: OMP's own OSC 0 title is enough.
    await attachTerminal("t-omp-title", "sess-omp-title");
    osc("t-omp-title", 0, "π > omp-pty");
    const info = svc.getByTerminalId("t-omp-title");
    expect(info?.agentId).toBe("omp");
    expect(info?.agentName).toBe("OMP");
    expect(info?.isAgent).toBe(true);
    expect(info?.activity).toBe("idle");

    // ...and it tracks the turn from the same signal.
    osc("t-omp-title", 0, "π ⠋ omp-pty");
    expect(svc.getByTerminalId("t-omp-title")?.activity).toBe("working");
    osc("t-omp-title", 0, "π > omp-pty");
    expect(svc.getByTerminalId("t-omp-title")?.activity).toBe("idle");
  });

  it("does not let pi's title claim an OMP terminal, or the reverse", async () => {
    await attachTerminal("t-pi-title", "sess-pi-title");
    osc("t-pi-title", 0, "π - my session - repo");
    expect(svc.getByTerminalId("t-pi-title")?.agentId).toBe("pi");

    // The same terminal id must never flip to omp from a pi title, and an OMP
    // terminal must never flip to pi — the two detectors are disjoint.
    await attachTerminal("t-omp-title-2", "sess-omp-title-2");
    osc("t-omp-title-2", 0, "π ! omp-pty");
    expect(svc.getByTerminalId("t-omp-title-2")?.agentId).toBe("omp");
  });

  it("recognizes a pi argv0 leader in the foreground poll", async () => {
    await attachTerminal("t-pi-leader", "sess-pi-leader");
    foreground("sess-pi-leader", {
      pgid: 5151,
      atPrompt: false,
      leader: "pi",
      cwd: "/proj",
    });
    const info = svc.getByTerminalId("t-pi-leader");
    expect(info?.agentId).toBe("pi");
    expect(info?.resumeCommand).toBe("was running pi in /proj");
  });
});

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

// RFC 0036 / issue #500. Re-attaching replays the session host's ring, so the
// detectors see a burst of old OSC titles — a whole finished turn, complete
// with its "done" marker. Before replay was tagged, that read as a turn
// finishing right now: indicators lit up and completion bells fired for work
// that ended before the app started. The replay is still needed (it is the only
// evidence of *which* agent owns a reattached terminal), so it is applied as
// identity and state, but never as attention.
describe("AgentsService — replayed output never raises attention", () => {
  it("settles a replayed turn to idle without flagging attention", async () => {
    const id = "t-replay-idle";
    const sessionId = "sess-replay-idle";
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

    // The whole turn arrives at once out of the ring.
    osc(id, 0, "\u2800", true);
    osc(id, 0, "\u2733 done", true);
    vi.advanceTimersByTime(AGENT_IDLE_DEBOUNCE_MS);

    expect(svc.getByTerminalId(id)?.activity).toBe("idle");
    expect(svc.getByTerminalId(id)?.needsAttention).toBe(false);

    // A genuinely live turn afterwards still flags attention normally.
    osc(id, 0, "\u2800");
    expect(svc.getByTerminalId(id)?.activity).toBe("working");
    osc(id, 0, "\u2733 done");
    vi.advanceTimersByTime(AGENT_IDLE_DEBOUNCE_MS);
    expect(svc.getByTerminalId(id)?.activity).toBe("idle");
    expect(svc.getByTerminalId(id)?.needsAttention).toBe(true);
  });

  it("never flips activity to working while replaying, even mid-burst", async () => {
    // ADR 0050 \u00a75: replayed bytes are identity evidence, never activity. A
    // terminal warmed for the first time this run (switching into a
    // workspace after restart) replays its whole ring in one burst \u2014 this
    // must not show a transient "working" between the replayed start-marker
    // and its matching "done", the same way it must never raise attention.
    const id = "t-replay-no-working-flash";
    const sessionId = "sess-replay-no-working-flash";
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
    getActive.mockReturnValue(null);

    osc(id, 0, "\u2800", true); // replayed "start working" \u2014 must not stick
    expect(svc.getByTerminalId(id)?.activity).toBe("idle");

    osc(id, 0, "\u2733 done", true);
    vi.advanceTimersByTime(AGENT_IDLE_DEBOUNCE_MS);
    expect(svc.getByTerminalId(id)?.activity).toBe("idle");

    // The identity evidence in that same replay still lands.
    expect(svc.getByTerminalId(id)?.isAgent).toBe(true);

    // A genuinely live turn afterwards is unaffected by the suppression above.
    osc(id, 0, "\u2800");
    expect(svc.getByTerminalId(id)?.activity).toBe("working");
  });

  it("suppresses attention for an agent persisted mid-working", async () => {
    // The case the old `suppressNextAttention` guard missed: it only armed when
    // the restored state was `idle && !needsAttention`, so a terminal saved
    // while its agent was still working announced a phantom completion.
    const id = "t-replay-midwork";
    const sessionId = "sess-replay-midwork";
    store.agentState[id] = {
      workspaceId: `ws-${id}`,
      isAgent: true,
      activity: "working",
      needsAttention: false,
      workingSource: "agent",
      workingSince: "2026-07-28T19:00:00.000Z",
      agentId: "claude",
      agentName: "Claude Code",
      lastLiveAt: "2026-07-28T19:00:00.000Z",
    };

    await attachTerminal(id, sessionId);
    getActive.mockReturnValue(null);

    osc(id, 0, "\u2733 done", true);
    vi.advanceTimersByTime(AGENT_IDLE_DEBOUNCE_MS);

    expect(svc.getByTerminalId(id)?.needsAttention).toBe(false);
  });

  it("keeps an unacknowledged attention that was restored from disk", async () => {
    // The user was owed this before the restart and never saw it. Suppression
    // is about not *raising* attention from stale evidence, not about clearing
    // attention that is still outstanding.
    const id = "t-replay-attn";
    const sessionId = "sess-replay-attn";
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

    getActive.mockReturnValue(null);
    osc(id, 0, "\u2800", true);
    osc(id, 0, "\u2733 done", true);
    vi.advanceTimersByTime(AGENT_IDLE_DEBOUNCE_MS);

    expect(svc.getByTerminalId(id)?.needsAttention).toBe(true);
  });

  it("still identifies the agent from replayed output alone", async () => {
    // Why the replay can't simply be dropped: on a reattached terminal it is
    // often the only thing that says an agent is running here at all.
    const id = "t-replay-identity";
    const sessionId = "sess-replay-identity";
    await attachTerminal(id, sessionId);
    getActive.mockReturnValue(null);

    expect(svc.getByTerminalId(id)?.isAgent).toBe(false);

    osc(id, 0, "\u2800", true);

    expect(svc.getByTerminalId(id)?.isAgent).toBe(true);
    expect(svc.getByTerminalId(id)?.needsAttention).toBe(false);
  });

  it("applies the same rule to the raw-output detector", async () => {
    // Cursor Agent's spinner is detected off raw PTY output rather than OSC —
    // an independent stream with the identical staleness problem.
    const id = "t-replay-output";
    const sessionId = "sess-replay-output";
    await attachTerminal(id, sessionId);
    getActive.mockReturnValue(null);

    output(id, "\u2801 Generating", true);

    expect(svc.getByTerminalId(id)?.needsAttention).toBe(false);
  });

  it("keeps a debounced idle marked as replay when its timer fires", async () => {
    // The idle transition rides a debounce timer that elapses long after the
    // replay is over. If the flag didn't travel with it, the delayed event
    // would arrive looking like an ordinary live tick and re-raise exactly the
    // attention the replay suppression just prevented.
    const id = "t-replay-timer";
    const sessionId = "sess-replay-timer";
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
    getActive.mockReturnValue(null);

    osc(id, 0, "\u2733 done", true);
    vi.advanceTimersByTime(AGENT_IDLE_DEBOUNCE_MS * 4);

    expect(svc.getByTerminalId(id)?.needsAttention).toBe(false);
  });
});

describe("AgentsService — resumed session id from --resume argv", () => {
  it("captures a resumed Cursor session's id from argv when the hook doesn't re-fire", async () => {
    // Resuming a Cursor session does not re-fire its SessionStart hook
    // (confirmed live), so there's no hook event to correlate. But the id is
    // in the agent's `--resume=<id>` argv, which Silo reads via `ps`.
    const id = "t-cursor-resume";
    const ptySessionId = "sess-cursor-resume";
    const cursorPgid = 92492;
    const resumedId = "a95d1c3b-5cae-40ad-aa88-dee475fc31e2";

    invoke.mockImplementation((cmd: string) => {
      if (cmd === "process_exec") {
        return Promise.resolve({
          stdout:
            `/Users/x/.local/bin/cursor-agent --use-system-ca /opt/index.js ` +
            `-f --resume=${resumedId}\n`,
        });
      }
      return Promise.resolve(null); // fs_read_text (no hook events on disk)
    });

    await attachTerminal(id, ptySessionId);
    foreground(ptySessionId, {
      pgid: cursorPgid,
      atPrompt: false,
      leader: "cursor-agent",
      cwd: "/tmp",
    });

    // Flush the async ps read + applyResumeHint.
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const info = svc.getByTerminalId(id);
    expect(info?.agentId).toBe("cursor");
    expect(info?.sessionId).toBe(resumedId);
    expect(info?.resumeCommand).toBe(`cursor-agent --resume ${resumedId}`);
  });

  it("leaves a fresh (non-resume) Cursor launch for the hook — argv sets no id", async () => {
    const id = "t-cursor-fresh";
    const ptySessionId = "sess-cursor-fresh";

    invoke.mockImplementation((cmd: string) => {
      if (cmd === "process_exec") {
        return Promise.resolve({
          stdout:
            "/Users/x/.local/bin/cursor-agent --use-system-ca /opt/index.js -f\n",
        });
      }
      return Promise.resolve(null);
    });

    await attachTerminal(id, ptySessionId);
    foreground(ptySessionId, {
      pgid: 77001,
      atPrompt: false,
      leader: "cursor-agent",
      cwd: "/tmp",
    });
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();

    // Detected as Cursor, but no exact id from argv (a fresh launch — the hook
    // is the right source, which didn't fire in this test).
    const info = svc.getByTerminalId(id);
    expect(info?.agentId).toBe("cursor");
    expect(info?.sessionId).toBeUndefined();
  });
});

describe("AgentsService — foreground stream follows PTY session recreation", () => {
  it("re-binds the foreground stream to the new session after a recreate so a resumed agent is still detected", async () => {
    // A reboot kills the PTY; recreating the terminal spawns a *new* PTY
    // session under the same terminal id. The foreground stream is keyed by
    // the PTY session id (not the stable terminal id), so it must re-bind to
    // the new session or a resumed agent is never seen (bug: inspector shows
    // kind: shell / isAgent: false after resuming a killed agent).
    const id = "t-recreate";
    const oldSid = "sess-old";
    const newSid = "sess-new";
    const resumedId = "b6e2d4a1-1111-2222-3333-444455556666";

    invoke.mockImplementation((cmd: string) => {
      if (cmd === "process_exec") {
        return Promise.resolve({
          stdout: `/Users/x/.local/bin/cursor-agent -f --resume=${resumedId}\n`,
        });
      }
      return Promise.resolve(null);
    });

    await attachTerminal(id, oldSid);
    // Foreground stream bound to the original PTY session.
    expect(fgCallbacks.has(oldSid)).toBe(true);

    // Recreate: TerminalPanel swaps the new PTY session id onto the record
    // (it does this before calling notifyTerminalSessionRecreated). The store
    // mutation re-runs syncSessions, which must re-bind the foreground stream.
    const wsId = `ws-${id}`;
    store.workspaces[wsId]!.terminals[0]!.sessionId = newSid;
    await Promise.resolve();
    await Promise.resolve();

    // Followed to the new session; the dead one is torn down.
    expect(fgCallbacks.has(newSid)).toBe(true);
    expect(fgCallbacks.has(oldSid)).toBe(false);

    // The resumed agent takes over the new session — detection must fire on it.
    foreground(newSid, {
      pgid: 44004,
      atPrompt: false,
      leader: "cursor-agent",
      cwd: "/tmp",
    });
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    const info = svc.getByTerminalId(id);
    expect(info?.agentId).toBe("cursor");
    expect(info?.sessionId).toBe(resumedId);
  });
});

// ---------------------------------------------------------------------------
// RFC 0038 Session 3.2 — one agent, one code path
// ---------------------------------------------------------------------------

describe("AgentInfo.title — one host-computed label for either kind", () => {
  beforeEach(() => {
    resetChatAgentRegistry();
    _resetAgentSurfaceRegistryForTests();
  });
  afterEach(() => resetChatAgentRegistry());

  it("falls back to the terminal's derived name", async () => {
    const id = "t-title-plain";
    await attachTerminal(id, "sess-title-plain");
    expect(svc.getByTerminalId(id)?.title).toBe("Terminal");
  });

  it("strips the agent's own status markers out of the OSC title", async () => {
    const id = "t-title-marker";
    await attachTerminal(id, "sess-title-marker");
    const ws = store.workspaces[`ws-${id}`]!;
    ws.terminals = [
      {
        id,
        sessionId: "sess-title-marker",
        kind: "shell",
        title: "⠋ my-project",
      },
    ];
    await Promise.resolve();
    await Promise.resolve();
    expect(svc.getByTerminalId(id)?.title).toBe("my-project");
  });

  it("a title that is nothing but a marker falls back rather than going blank", async () => {
    // Claude emits a bare ✳ before its first conversation title exists.
    const id = "t-title-bare";
    await attachTerminal(id, "sess-title-bare");
    const ws = store.workspaces[`ws-${id}`]!;
    ws.terminals = [
      { id, sessionId: "sess-title-bare", kind: "shell", title: "✳" },
    ];
    await Promise.resolve();
    await Promise.resolve();
    expect(svc.getByTerminalId(id)?.title).toBe("✳");
  });

  it("the user's own name wins, and a rename lands on the next snapshot", async () => {
    // The gap this closes: a rename changes no *activity*, so it produces no
    // activity event — a status row keyed on this field would sit on the old
    // name forever.
    const id = "t-title-rename";
    await attachTerminal(id, "sess-title-rename");
    const seen = vi.fn();
    const sub = svc.subscribe(seen, { allWorkspaces: true });
    const ws = store.workspaces[`ws-${id}`]!;
    ws.terminals = [
      {
        id,
        sessionId: "sess-title-rename",
        kind: "shell",
        title: "⠋ my-project",
        customName: "My Agent",
      },
    ];
    await Promise.resolve();
    await Promise.resolve();
    expect(svc.getByTerminalId(id)?.title).toBe("My Agent");
    expect(seen).toHaveBeenCalled();
    sub.dispose();
  });

  it("a Chat session carries whatever the sessions service registered", async () => {
    const ws = makeWorkspace("ws-chat-title");
    store.workspaces = { ...store.workspaces, [ws.id]: ws };
    store.activeWorkspaceId = ws.id;
    await Promise.resolve();
    registerChatAgent(chatSession("chat:title", ws.id));
    expect(svc.getState().find((a) => a.id === "chat:title")?.title).toBe(
      "Claude Agent",
    );
    // ...and an agent-volunteered title replaces it (the `session_info_update`
    // fold in acp-sessions-service patches exactly this field).
    patchChatAgent("chat:title", { title: "Refactor the dock registry" });
    expect(svc.getState().find((a) => a.id === "chat:title")?.title).toBe(
      "Refactor the dock registry",
    );
  });
});

describe("ctx.agents.getActive / subscribeActive", () => {
  beforeEach(() => {
    resetChatAgentRegistry();
    _resetAgentSurfaceRegistryForTests();
    setActiveTerminal(null);
  });

  it("reports the active terminal tab", () => {
    setActiveTerminal("t-active");
    expect(svc.getActive()).toBe("t-active");
  });

  it("reports the Chat session a declaring panel is showing", () => {
    setPanelAgentSession("acp-chat:p1", "chat:abc");
    setActiveDockPanel("acp-chat:p1");
    expect(svc.getActive()).toBe("chat:abc");
  });

  it("subscribeActive fires across both kinds", () => {
    const seen: (string | null)[] = [];
    const sub = svc.subscribeActive((id) => seen.push(id));
    setActiveTerminal("t-1");
    setActiveTerminal(null);
    setPanelAgentSession("acp-chat:p1", "chat:abc");
    setActiveDockPanel("acp-chat:p1");
    sub.dispose();
    expect(seen).toEqual(["t-1", null, "chat:abc"]);
  });
});

describe("ctx.agents.bindActivity / bindIcon — one binder, both tab kinds", () => {
  beforeEach(() => {
    resetChatAgentRegistry();
    _resetAgentSurfaceRegistryForTests();
    tabAdornmentRegistry._resetForTests();
  });

  it("routes a terminal tab straight through — its Agent Session id is its terminal id", () => {
    const sub = svc.bindActivity({
      id: "test.badge",
      provide: (agentId) =>
        agentId === "t-1" ? { activity: "working", tooltip: "go" } : null,
    });
    expect(tabAdornmentRegistry.getActivities("terminal", "t-1")).toEqual([
      { id: "test.badge", activity: "working", tooltip: "go" },
    ]);
    expect(tabAdornmentRegistry.getActivities("terminal", "t-2")).toEqual([]);
    sub.dispose();
  });

  it("translates a panel tab to the session it declared", () => {
    setPanelAgentSession("acp-chat:p1", "chat:abc");
    const sub = svc.bindActivity({
      id: "test.badge",
      provide: (agentId) =>
        agentId === "chat:abc" ? { activity: "ready" } : null,
    });
    expect(tabAdornmentRegistry.getActivities("panel", "acp-chat:p1")).toEqual([
      { id: "test.badge", activity: "ready" },
    ]);
    // A panel that declared nothing is not an agent surface and gets nothing —
    // the Output panel, a web viewer, any third-party panel.
    expect(tabAdornmentRegistry.getActivities("panel", "output:1")).toEqual([]);
    sub.dispose();
  });

  it("bindIcon does the same, and one dispose removes both registrations", () => {
    setPanelAgentSession("acp-chat:p1", "chat:abc");
    const sub = svc.bindIcon({
      id: "test.icon",
      provide: (agentId) => (agentId === "chat:abc" ? { icon: "x" } : null),
    });
    expect(tabAdornmentRegistry.getIcons("panel", "acp-chat:p1")).toEqual([
      { id: "test.icon", icon: "x" },
    ]);
    sub.dispose();
    expect(tabAdornmentRegistry.getIcons("panel", "acp-chat:p1")).toEqual([]);
    expect(tabAdornmentRegistry.getIcons("terminal", "chat:abc")).toEqual([]);
  });

  it("invalidateAdornments notifies subscribers so a setting change re-queries", () => {
    const listener = vi.fn();
    const sub = tabAdornmentRegistry.subscribe(listener);
    svc.invalidateAdornments();
    expect(listener).toHaveBeenCalled();
    sub.dispose();
  });
});

describe("ctx.agents.close — either kind", () => {
  beforeEach(() => {
    resetChatAgentRegistry();
    _resetAgentSurfaceRegistryForTests();
  });
  afterEach(() => resetChatAgentRegistry());

  it("closes a Terminal session's terminal", async () => {
    const id = "t-close";
    await attachTerminal(id, "sess-close");
    svc.close(id);
    expect(close).toHaveBeenCalledWith(id);
  });

  it("closes the panel showing a Chat session", async () => {
    const ws = makeWorkspace("ws-close-chat");
    store.workspaces = { ...store.workspaces, [ws.id]: ws };
    store.activeWorkspaceId = ws.id;
    await Promise.resolve();
    registerChatAgent(chatSession("chat:close", ws.id));
    const panelClose = vi.fn();
    setPanelAgentSession("acp-chat:p1", "chat:close", { close: panelClose });
    svc.close("chat:close");
    expect(panelClose).toHaveBeenCalledTimes(1);
  });

  it("leaves a Chat session with no mounted panel alone", async () => {
    const ws = makeWorkspace("ws-close-orphan");
    store.workspaces = { ...store.workspaces, [ws.id]: ws };
    store.activeWorkspaceId = ws.id;
    await Promise.resolve();
    registerChatAgent(chatSession("chat:orphan", ws.id));
    expect(() => svc.close("chat:orphan")).not.toThrow();
    expect(close).not.toHaveBeenCalled();
  });

  it("is a no-op for an unknown id", () => {
    svc.close("nope");
    expect(close).not.toHaveBeenCalled();
  });
});

/** A registered Chat session, as `acp-sessions-service` would write it. */
function chatSession(id: string, workspaceId: string) {
  return {
    id,
    workspaceId,
    kind: "chat" as const,
    isAgent: true,
    activity: "idle" as const,
    needsAttention: false,
    stale: false,
    canResume: false,
    title: "Claude Agent",
    agentName: "Claude Agent",
  };
}

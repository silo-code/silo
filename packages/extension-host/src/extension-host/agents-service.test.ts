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

// Skip the hook-events file poll entirely — irrelevant to activity-state
// tests and would otherwise do a real subprocess/file read every tick.
vi.mock("./agent-hook-events", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./agent-hook-events")>();
  return { ...actual, readNewHookEvents: vi.fn(() => Promise.resolve([])) };
});

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
});

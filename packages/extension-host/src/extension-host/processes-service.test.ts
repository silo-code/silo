import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { TerminalRecord } from "@silo-code/sdk";

// ---- module-level mocks (must come before the import under test) -------------
// All variables used inside vi.mock() factory functions MUST be declared via
// vi.hoisted() — factories are hoisted before any variable declarations.

const { storeSubscribers, mockStore, fgSubscriptions, mockInvoke } = vi.hoisted(
  () => {
    type FgCallback = (fg: {
      pgid: number;
      atPrompt: boolean;
      leader: string;
      cwd: string;
    }) => void;

    return {
      storeSubscribers: [] as Array<() => void>,
      mockStore: {
        activeWorkspaceId: "ws1" as string | null,
        workspaces: {
          ws1: { id: "ws1", terminals: [] as TerminalRecord[] },
        } as Record<string, { id: string; terminals: TerminalRecord[] }>,
      },
      fgSubscriptions: new Map<string, FgCallback[]>(),
      mockInvoke: vi.fn(),
    };
  },
);

// Mock valtio's subscribe so we can control when store-change callbacks fire.
vi.mock("valtio", () => ({
  subscribe: (_obj: unknown, cb: () => void) => {
    storeSubscribers.push(cb);
    return () => {
      const i = storeSubscribers.indexOf(cb);
      if (i !== -1) storeSubscribers.splice(i, 1);
    };
  },
}));

// Mock the store with controllable workspace / terminal state.
vi.mock("../state/store", () => ({ store: mockStore }));

// Track foreground subscriptions so we can simulate daemon events.
type FgCallback = (fg: {
  pgid: number;
  atPrompt: boolean;
  leader: string;
  cwd: string;
}) => void;
vi.mock("./terminal-foreground", () => ({
  onTerminalForeground: (sessionId: string, cb: FgCallback) => {
    const list = fgSubscriptions.get(sessionId) ?? [];
    list.push(cb);
    fgSubscriptions.set(sessionId, list);
    return () => {
      const current = fgSubscriptions.get(sessionId) ?? [];
      const idx = current.indexOf(cb);
      if (idx !== -1) current.splice(idx, 1);
    };
  },
}));

// Mock Tauri invoke.
vi.mock("@tauri-apps/api/core", () => ({ invoke: mockInvoke }));

// ---- import after mocks -------------------------------------------------------
// vi.mock() calls above are hoisted before any import, so the mocks are already
// active when the module loads and its top-level syncSessions() / subscribe()
// run against the mock store and the mock valtio.

import {
  getProcessesService,
  getScopedProcessesService,
} from "./processes-service";

// ---- helpers -----------------------------------------------------------------

function emitFg(
  sessionId: string,
  fg: { pgid: number; atPrompt: boolean; leader: string; cwd: string },
) {
  for (const cb of fgSubscriptions.get(sessionId) ?? []) cb(fg);
}

function triggerStoreSync() {
  for (const cb of storeSubscribers) cb();
}

function makeTerminal(
  id: string,
  sessionId: string,
  title = "shell",
): TerminalRecord {
  return { id, sessionId, kind: "shell", title };
}

// ---- tests -------------------------------------------------------------------

beforeEach(() => {
  fgSubscriptions.clear();
  mockStore.activeWorkspaceId = "ws1";
  mockStore.workspaces = { ws1: { id: "ws1", terminals: [] } };
  mockInvoke.mockReset();
  // Default: terminal_foreground_snapshot returns null (no cached state).
  // Tests that need specific invoke return values override with mockResolvedValue[Once].
  mockInvoke.mockResolvedValue(null);
  vi.useFakeTimers();
  // Re-sync so the service picks up the fresh store state.
  triggerStoreSync();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("getState / subscribe", () => {
  it("includes sessions immediately when attached, even before foreground events arrive", () => {
    const svc = getProcessesService();
    mockStore.workspaces.ws1.terminals = [
      makeTerminal("t1", "sid1", "My Shell"),
    ];
    triggerStoreSync();
    // Sessions appear right away with placeholder state (atPrompt: true, pgid: 0)
    // so the panel is never empty for users who have terminals open.
    const state = svc.getState();
    expect(state).toHaveLength(1);
    expect(state[0]).toMatchObject({
      sessionId: "sid1",
      pgid: 0,
      atPrompt: true,
    });
  });

  it("populates state after a foreground event arrives", () => {
    const svc = getProcessesService();
    mockStore.workspaces.ws1.terminals = [
      makeTerminal("t1", "sid1", "My Shell"),
    ];
    triggerStoreSync();

    emitFg("sid1", {
      pgid: 1234,
      atPrompt: false,
      leader: "node",
      cwd: "/src",
    });

    const state = svc.getState();
    expect(state).toHaveLength(1);
    expect(state[0]).toMatchObject({
      sessionId: "sid1",
      terminalId: "t1",
      terminalTitle: "My Shell",
      pgid: 1234,
      leader: "node",
      cwd: "/src",
      atPrompt: false,
    });
  });

  it("updates info on subsequent foreground events", () => {
    const svc = getProcessesService();
    mockStore.workspaces.ws1.terminals = [makeTerminal("t1", "sid1")];
    triggerStoreSync();

    emitFg("sid1", { pgid: 1234, atPrompt: false, leader: "vim", cwd: "/src" });
    emitFg("sid1", {
      pgid: 1000,
      atPrompt: true,
      leader: "-zsh",
      cwd: "/home",
    });

    const [info] = svc.getState();
    expect(info.leader).toBe("-zsh");
    expect(info.atPrompt).toBe(true);
    expect(info.pgid).toBe(1000);
  });

  it("subscribe fires listeners on foreground change", () => {
    const svc = getProcessesService();
    mockStore.workspaces.ws1.terminals = [makeTerminal("t1", "sid1")];
    triggerStoreSync();

    const calls: unknown[][] = [];
    const sub = svc.subscribe((s) => calls.push(s));

    emitFg("sid1", { pgid: 42, atPrompt: false, leader: "node", cwd: "/" });
    expect(calls).toHaveLength(1);
    expect(calls[0][0]).toMatchObject({ pgid: 42 });

    sub.dispose();
    emitFg("sid1", { pgid: 99, atPrompt: true, leader: "-zsh", cwd: "/" });
    // Listener was disposed — no additional call.
    expect(calls).toHaveLength(1);
  });

  it("scopes getState to the active workspace only", () => {
    const svc = getProcessesService();
    mockStore.workspaces.ws1.terminals = [makeTerminal("t1", "sid1")];
    mockStore.workspaces.ws2 = {
      id: "ws2",
      terminals: [makeTerminal("t2", "sid2")],
    };
    triggerStoreSync();

    emitFg("sid1", { pgid: 1, atPrompt: false, leader: "a", cwd: "/" });
    emitFg("sid2", { pgid: 2, atPrompt: false, leader: "b", cwd: "/" });

    // Active workspace is ws1 → only sid1 appears.
    expect(svc.getState()).toHaveLength(1);
    expect(svc.getState()[0].sessionId).toBe("sid1");

    // Switch active workspace → only sid2 appears.
    // In production, valtio fires the store subscriber on any proxy mutation;
    // here we trigger it manually to flush the cached snapshot.
    mockStore.activeWorkspaceId = "ws2";
    triggerStoreSync();
    expect(svc.getState()).toHaveLength(1);
    expect(svc.getState()[0].sessionId).toBe("sid2");
  });
});

describe("getByTerminalId", () => {
  it("returns undefined before first foreground event", () => {
    const svc = getProcessesService();
    mockStore.workspaces.ws1.terminals = [makeTerminal("t1", "sid1")];
    triggerStoreSync();
    expect(svc.getByTerminalId("t1")).toBeUndefined();
  });

  it("returns the ProcessInfo after a foreground event", () => {
    const svc = getProcessesService();
    mockStore.workspaces.ws1.terminals = [makeTerminal("t1", "sid1")];
    triggerStoreSync();

    emitFg("sid1", { pgid: 5, atPrompt: false, leader: "python", cwd: "/py" });
    const info = svc.getByTerminalId("t1");
    expect(info).toBeDefined();
    expect(info?.leader).toBe("python");
  });

  it("returns undefined for an unknown terminalId", () => {
    const svc = getProcessesService();
    expect(svc.getByTerminalId("nonexistent")).toBeUndefined();
  });
});

describe("kill", () => {
  it("invokes process_kill_group with the correct pgid", async () => {
    const svc = getProcessesService();
    mockInvoke.mockResolvedValue(undefined);
    await svc.kill(9999);
    expect(mockInvoke).toHaveBeenCalledWith("process_kill_group", {
      pgid: 9999,
    });
  });
});

describe("getScopedProcessesService", () => {
  it("trusted scope bypasses permission check on kill", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const scoped = getScopedProcessesService({
      get roots() {
        return [];
      },
      trusted: true,
      permissions: new Set(),
    });
    await expect(scoped.kill(1)).resolves.toBeUndefined();
  });

  it("untrusted scope without process permission throws on kill", async () => {
    const scoped = getScopedProcessesService({
      get roots() {
        return [];
      },
      trusted: false,
      permissions: new Set(),
    });
    await expect(scoped.kill(1)).rejects.toThrow(/process/);
  });

  it("untrusted scope with process permission allows kill", async () => {
    mockInvoke.mockResolvedValue(undefined);
    const scoped = getScopedProcessesService({
      get roots() {
        return [];
      },
      trusted: false,
      permissions: new Set(["process"]),
    });
    await expect(scoped.kill(1)).resolves.toBeUndefined();
  });
});

describe("enableStats refcounting", () => {
  it("starts polling on first enableStats call and stops on last dispose", async () => {
    const svc = getProcessesService();
    mockStore.workspaces.ws1.terminals = [makeTerminal("t1", "sid1")];
    triggerStoreSync();
    emitFg("sid1", { pgid: 42, atPrompt: false, leader: "node", cwd: "/" });

    mockInvoke.mockResolvedValue([
      { pid: 42, cpuPercent: 10.0, memoryMb: 128.0 },
    ]);

    const d1 = svc.enableStats();
    const d2 = svc.enableStats();

    // Tick the stats interval.
    await vi.advanceTimersByTimeAsync(1600);
    expect(mockInvoke).toHaveBeenCalledWith("process_get_stats", {
      pids: [42],
      withTrees: false,
    });

    // Disposing one handle should not stop polling.
    d1.dispose();
    mockInvoke.mockClear();
    await vi.advanceTimersByTimeAsync(1600);
    expect(mockInvoke).toHaveBeenCalledTimes(1);

    // Disposing the last handle stops polling.
    d2.dispose();
    mockInvoke.mockClear();
    await vi.advanceTimersByTimeAsync(1600);
    expect(mockInvoke).not.toHaveBeenCalled();
  });

  it("merges stats into ProcessInfo and notifies subscribers", async () => {
    const svc = getProcessesService();
    mockStore.workspaces.ws1.terminals = [makeTerminal("t1", "sid1")];
    triggerStoreSync();
    emitFg("sid1", { pgid: 99, atPrompt: false, leader: "node", cwd: "/" });

    mockInvoke.mockResolvedValue([
      { pid: 99, cpuPercent: 55.5, memoryMb: 256.0 },
    ]);

    const updates: unknown[] = [];
    const sub = svc.subscribe((s) => updates.push(s[0]?.stats));

    const d = svc.enableStats();
    await vi.advanceTimersByTimeAsync(1600);

    expect(updates).toHaveLength(1);
    expect(updates[0]).toMatchObject({
      pid: 99,
      cpuPercent: 55.5,
      memoryMb: 256.0,
    });

    d.dispose();
    sub.dispose();
  });

  it("requests trees while a trees handle is held and clears them after", async () => {
    const svc = getProcessesService();
    mockStore.workspaces.ws1.terminals = [makeTerminal("t1", "sid1")];
    triggerStoreSync();
    emitFg("sid1", { pgid: 42, atPrompt: false, leader: "node", cwd: "/" });

    const tree = {
      pid: 42,
      command: "node",
      cpuPercent: 10.0,
      memoryMb: 128.0,
      children: [
        {
          pid: 43,
          command: "esbuild",
          cpuPercent: 5.0,
          memoryMb: 64.0,
          children: [],
        },
      ],
    };
    mockInvoke.mockResolvedValue([
      { pid: 42, cpuPercent: 10.0, memoryMb: 128.0, tree },
    ]);

    const plain = svc.enableStats();
    const withTrees = svc.enableStats({ trees: true });

    await vi.advanceTimersByTimeAsync(1600);
    expect(mockInvoke).toHaveBeenCalledWith("process_get_stats", {
      pids: [42],
      withTrees: true,
    });
    expect(svc.getState()[0].tree).toMatchObject({
      pid: 42,
      children: [{ pid: 43, command: "esbuild" }],
    });
    // The tree is not folded into stats.
    expect(svc.getState()[0].stats).toEqual({
      pid: 42,
      cpuPercent: 10.0,
      memoryMb: 128.0,
    });

    // Dropping the trees handle keeps stats polling but stops requesting trees;
    // the next tick (with no tree in the response) clears it from the info.
    withTrees.dispose();
    mockInvoke.mockClear();
    mockInvoke.mockResolvedValue([
      { pid: 42, cpuPercent: 10.0, memoryMb: 128.0 },
    ]);
    await vi.advanceTimersByTimeAsync(1600);
    expect(mockInvoke).toHaveBeenCalledWith("process_get_stats", {
      pids: [42],
      withTrees: false,
    });
    expect(svc.getState()[0].tree).toBeUndefined();
    expect(svc.getState()[0].stats).toBeDefined();

    plain.dispose();
  });

  it("double-disposing a handle does not corrupt the refcount", async () => {
    const svc = getProcessesService();
    mockStore.workspaces.ws1.terminals = [makeTerminal("t1", "sid1")];
    triggerStoreSync();
    emitFg("sid1", { pgid: 42, atPrompt: false, leader: "node", cwd: "/" });
    mockInvoke.mockResolvedValue([
      { pid: 42, cpuPercent: 1.0, memoryMb: 10.0 },
    ]);

    const d1 = svc.enableStats();
    const d2 = svc.enableStats();
    d1.dispose();
    d1.dispose(); // second dispose of the same handle must be a no-op

    mockInvoke.mockClear();
    await vi.advanceTimersByTimeAsync(1600);
    // d2 is still held, so polling must continue.
    expect(mockInvoke).toHaveBeenCalledTimes(1);
    d2.dispose();
  });

  it("clears stats from ProcessInfo when polling stops", async () => {
    const svc = getProcessesService();
    mockStore.workspaces.ws1.terminals = [makeTerminal("t1", "sid1")];
    triggerStoreSync();
    emitFg("sid1", { pgid: 7, atPrompt: false, leader: "vim", cwd: "/" });
    mockInvoke.mockResolvedValue([{ pid: 7, cpuPercent: 1.0, memoryMb: 50.0 }]);

    const d = svc.enableStats();
    await vi.advanceTimersByTimeAsync(1600);
    expect(svc.getState()[0].stats).toBeDefined();

    d.dispose();
    expect(svc.getState()[0].stats).toBeUndefined();
  });
});

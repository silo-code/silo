import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const {
  readNewHookEvents,
  pruneAgentHooksEventsFile,
  resolveAgentHooksDir,
  stampNewHookEvents,
  matchHookEventsToTerminals,
  pickEarliestMatchPerTerminal,
  pruneUnmatchedEvents,
  resetHookEventsCheckpoint,
  disposeHookEventsRuntime,
} = vi.hoisted(() => ({
  readNewHookEvents: vi.fn(),
  pruneAgentHooksEventsFile: vi.fn(() => Promise.resolve()),
  resolveAgentHooksDir: vi.fn(() => Promise.resolve("/tmp/.silo/agent-hooks")),
  stampNewHookEvents: vi.fn((events: unknown[], now: number) =>
    (events as object[]).map((event) => ({ event, firstSeenAt: now })),
  ),
  matchHookEventsToTerminals: vi.fn(() => []),
  pickEarliestMatchPerTerminal: vi.fn((m: unknown) => m),
  pruneUnmatchedEvents: vi.fn(() => []),
  resetHookEventsCheckpoint: vi.fn(),
  disposeHookEventsRuntime: vi.fn(),
}));

vi.mock("./agent-hook-events", () => ({
  readNewHookEvents,
  pruneAgentHooksEventsFile,
  resolveAgentHooksDir,
  stampNewHookEvents,
  matchHookEventsToTerminals,
  pickEarliestMatchPerTerminal,
  pruneUnmatchedEvents,
  resetHookEventsCheckpoint,
  disposeHookEventsRuntime,
  // Faithful to the real impl: null sticky agent allows any event; otherwise
  // the event's agent must equal the terminal's sticky catalog id.
  hookEventCompatibleWithStickyAgent: (
    eventAgent: string,
    sticky: string | null,
  ) => sticky == null || eventAgent === sticky,
}));

vi.mock("./agents-channel", () => ({
  agentsChannel: { debug: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

vi.mock("../services/tauri-watch", () => ({
  startWatch: vi.fn(() => Promise.resolve()),
  stopWatch: vi.fn(() => Promise.resolve()),
  onFileChange: vi.fn(() => Promise.resolve(() => {})),
}));

import { createHookRuntime } from "./agent-hook-runtime";

describe("createHookRuntime — consume single-flight", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    readNewHookEvents.mockReset();
    pruneAgentHooksEventsFile.mockReset().mockResolvedValue(undefined);
    stampNewHookEvents.mockImplementation((events: unknown[], now: number) =>
      (events as object[]).map((event) => ({ event, firstSeenAt: now })),
    );
    matchHookEventsToTerminals.mockReset().mockReturnValue([]);
    pickEarliestMatchPerTerminal.mockImplementation((m: unknown) => m);
    pruneUnmatchedEvents.mockReset().mockReturnValue([]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("queues a second consume while one is in flight and runs it after", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let calls = 0;
    readNewHookEvents.mockImplementation(async () => {
      calls += 1;
      if (calls === 1) await gate;
      return [];
    });

    const runtime = createHookRuntime({
      listTerminals: () => [
        { terminalId: "t1", pgid: 1, agentPgid: 1, agentCatalogId: "cursor" },
      ],
      applyHookMatch: vi.fn(),
    });

    const first = runtime.consumeHookEvents();
    const second = runtime.consumeHookEvents(); // should queue, not overlap
    expect(calls).toBe(1);

    release();
    await first;
    await second;
    // Drain the queued re-entry scheduled in finally.
    await Promise.resolve();
    await Promise.resolve();

    expect(calls).toBe(2);
    runtime.dispose();
  });

  it("drops a hook match whose agent doesn't match the terminal, keeping the real one", async () => {
    // A Cursor session fires both a cursor event and a Claude-tagged twin on
    // the SAME pgid (a claude subprocess re-running Claude's SessionStart
    // hook). Both pgid-match the Cursor terminal; only the cursor one must be
    // applied — even if the claude twin is "earliest".
    const claudeTwin = {
      pid: 1,
      sessionId: "claude-twin-id",
      cwd: "",
      agent: "claude",
      timestamp: "2026-07-30T00:00:00Z",
    };
    const cursorEvent = {
      pid: 1,
      sessionId: "real-cursor-id",
      cwd: "",
      agent: "cursor",
      timestamp: "2026-07-30T00:00:01Z", // later than the twin
    };
    readNewHookEvents.mockResolvedValue([claudeTwin, cursorEvent]);
    // Both events pgid-match the one terminal.
    matchHookEventsToTerminals.mockReturnValue([
      { terminalId: "t1", event: claudeTwin },
      { terminalId: "t1", event: cursorEvent },
    ]);
    // Faithful "earliest per terminal" — would pick the claude twin if it
    // weren't filtered out first.
    pickEarliestMatchPerTerminal.mockImplementation(
      (ms: { terminalId: string; event: { timestamp: string } }[]) => {
        const best = new Map<string, (typeof ms)[number]>();
        for (const m of ms) {
          const prev = best.get(m.terminalId);
          if (!prev || m.event.timestamp < prev.event.timestamp)
            best.set(m.terminalId, m);
        }
        return [...best.values()];
      },
    );

    const applyHookMatch = vi.fn();
    const runtime = createHookRuntime({
      listTerminals: () => [
        { terminalId: "t1", pgid: 1, agentPgid: 1, agentCatalogId: "cursor" },
      ],
      applyHookMatch,
    });

    await runtime.consumeHookEvents();

    expect(applyHookMatch).toHaveBeenCalledTimes(1);
    expect(applyHookMatch).toHaveBeenCalledWith(
      "t1",
      expect.objectContaining({ agent: "cursor", sessionId: "real-cursor-id" }),
    );
    runtime.dispose();
  });
});

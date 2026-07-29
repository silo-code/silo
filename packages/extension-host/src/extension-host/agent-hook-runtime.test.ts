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
      listTerminals: () => [{ terminalId: "t1", pgid: 1, agentPgid: 1 }],
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
});

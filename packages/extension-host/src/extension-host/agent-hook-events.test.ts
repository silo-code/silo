import { describe, expect, it } from "vitest";
import {
  matchHookEventsToTerminals,
  pruneUnmatchedEvents,
  type HookEvent,
} from "./agent-hook-events";

// Fixed (not `new Date()`) so two `event()` calls produce deeply-equal
// objects — the matcher is pure and doesn't read the timestamp, but the
// tests compare whole events with toEqual.
const FIXED_TIMESTAMP = "2026-07-27T12:00:00.000Z";

function event(overrides: Partial<HookEvent> = {}): HookEvent {
  return {
    pid: 111,
    sessionId: "session-a",
    cwd: "/tmp/proj",
    agent: "claude",
    timestamp: FIXED_TIMESTAMP,
    ...overrides,
  };
}

describe("matchHookEventsToTerminals", () => {
  it("matches an event to the terminal whose pgid equals its pid", () => {
    const terminals = [
      { terminalId: "t1", pgid: 111 },
      { terminalId: "t2", pgid: 222 },
    ];
    const evt = event({ pid: 222 });
    const result = matchHookEventsToTerminals([evt], terminals);
    expect(result).toEqual([{ terminalId: "t2", event: evt }]);
  });

  it("never matches a terminal with a null pgid", () => {
    const terminals = [{ terminalId: "t1", pgid: null }];
    const result = matchHookEventsToTerminals([event({ pid: 111 })], terminals);
    expect(result).toEqual([]);
  });

  it("returns no match when no terminal's pgid equals the event's pid", () => {
    const terminals = [{ terminalId: "t1", pgid: 999 }];
    const result = matchHookEventsToTerminals([event({ pid: 111 })], terminals);
    expect(result).toEqual([]);
  });

  it("matches each event independently across multiple events", () => {
    const terminals = [
      { terminalId: "t1", pgid: 111 },
      { terminalId: "t2", pgid: 222 },
    ];
    const events = [
      event({ pid: 111, sessionId: "a" }),
      event({ pid: 222, sessionId: "b" }),
    ];
    const result = matchHookEventsToTerminals(events, terminals);
    expect(result.map((m) => m.terminalId)).toEqual(["t1", "t2"]);
    expect(result.map((m) => m.event.sessionId)).toEqual(["a", "b"]);
  });

  it("returns an empty array for empty inputs", () => {
    expect(matchHookEventsToTerminals([], [])).toEqual([]);
    expect(matchHookEventsToTerminals([event()], [])).toEqual([]);
    expect(
      matchHookEventsToTerminals([], [{ terminalId: "t1", pgid: 111 }]),
    ).toEqual([]);
  });
});

describe("pruneUnmatchedEvents", () => {
  const NOW = Date.parse(FIXED_TIMESTAMP);

  it("carries forward an unmatched, fresh event to retry on the next poll", () => {
    // The exact race this exists for: an event arrived (was read) before the
    // terminal's pgid caught up, so it didn't match *this* poll.
    const unmatched = event({ pid: 111 });
    const result = pruneUnmatchedEvents([unmatched], [], NOW);
    expect(result).toEqual([unmatched]);
  });

  it("drops an event once it has been matched", () => {
    const matched = event({ pid: 111 });
    const result = pruneUnmatchedEvents(
      [matched],
      [{ terminalId: "t1", event: matched }],
      NOW,
    );
    expect(result).toEqual([]);
  });

  it("drops an unmatched event once it exceeds the staleness bound", () => {
    const stale = event({ pid: 111 });
    const farFuture = NOW + 11 * 60 * 1000; // past MAX_EVENT_AGE_MS (10 min)
    const result = pruneUnmatchedEvents([stale], [], farFuture);
    expect(result).toEqual([]);
  });

  it("only carries forward events that are both unmatched and fresh", () => {
    const matched = event({ pid: 111, sessionId: "matched" });
    const unmatchedFresh = event({ pid: 222, sessionId: "fresh" });
    const unmatchedStale = event({
      pid: 333,
      sessionId: "stale",
      timestamp: new Date(NOW - 20 * 60 * 1000).toISOString(),
    });
    const result = pruneUnmatchedEvents(
      [matched, unmatchedFresh, unmatchedStale],
      [{ terminalId: "t1", event: matched }],
      NOW,
    );
    expect(result).toEqual([unmatchedFresh]);
  });
});

import { describe, expect, it } from "vitest";
import {
  matchHookEventsToTerminals,
  type HookEvent,
} from "./agent-hook-events";

function event(overrides: Partial<HookEvent> = {}): HookEvent {
  return {
    pid: 111,
    sessionId: "session-a",
    cwd: "/tmp/proj",
    agent: "claude",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

describe("matchHookEventsToTerminals", () => {
  it("matches an event to the terminal whose pgid equals its pid", () => {
    const terminals = [
      { terminalId: "t1", pgid: 111 },
      { terminalId: "t2", pgid: 222 },
    ];
    const result = matchHookEventsToTerminals([event({ pid: 222 })], terminals);
    expect(result).toEqual([{ terminalId: "t2", event: event({ pid: 222 }) }]);
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

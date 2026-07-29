import { describe, expect, it } from "vitest";
import {
  matchHookEventsToTerminals,
  pickEarliestMatchPerTerminal,
  pruneUnmatchedEvents,
  selectEventsJsonlLinesToKeep,
  shouldAcceptHookSessionId,
  hookEventCompatibleWithStickyAgent,
  stampNewHookEvents,
  type HookEvent,
  type PendingHookEvent,
} from "./agent-hook-events";

// Fixed (not `new Date()`) so two `event()` calls produce deeply-equal
// objects — the matcher is pure and doesn't read the timestamp, but the
// tests compare whole events with toEqual.
const FIXED_TIMESTAMP = "2026-07-27T12:00:00.000Z";
const NOW = Date.parse(FIXED_TIMESTAMP);

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

function pending(ev: HookEvent, firstSeenAt: number = NOW): PendingHookEvent {
  return { event: ev, firstSeenAt };
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

  it("never matches a terminal with a null pgid and no agentPgid", () => {
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

  it("matches via sticky agentPgid when current pgid has drifted to a tool", () => {
    // Confirmed live: Claude's SessionStart reports pid=P, then a bash tool
    // takes foreground with its own pgid — currentPgid≠P, but agentPgid=P
    // still correlates.
    const evt = event({ pid: 40698 });
    const terminals = [{ terminalId: "t1", pgid: 23122, agentPgid: 40698 }];
    expect(matchHookEventsToTerminals([evt], terminals)).toEqual([
      { terminalId: "t1", event: evt },
    ]);
  });

  it("does not match a stale agentPgid from a different terminal", () => {
    const evt = event({ pid: 40698 });
    const terminals = [
      { terminalId: "t1", pgid: 1, agentPgid: 999 },
      { terminalId: "t2", pgid: 2, agentPgid: null },
    ];
    expect(matchHookEventsToTerminals([evt], terminals)).toEqual([]);
  });
});

describe("pruneUnmatchedEvents", () => {
  it("carries forward an unmatched, freshly-seen event to retry on the next poll", () => {
    // The exact race this exists for: an event arrived (was read) before the
    // terminal's pgid caught up, so it didn't match *this* poll.
    const unmatched = pending(event({ pid: 111 }));
    const result = pruneUnmatchedEvents([unmatched], [], NOW);
    expect(result).toEqual([unmatched]);
  });

  it("drops an event once it has been matched", () => {
    const matched = pending(event({ pid: 111 }));
    const result = pruneUnmatchedEvents(
      [matched],
      [{ terminalId: "t1", event: matched.event }],
      NOW,
    );
    expect(result).toEqual([]);
  });

  it("drops an unmatched event once its retry TTL (from firstSeenAt) expires", () => {
    const stale = pending(event({ pid: 111 }), NOW);
    const farFuture = NOW + 11 * 60 * 1000; // past MAX_EVENT_AGE_MS (10 min)
    const result = pruneUnmatchedEvents([stale], [], farFuture);
    expect(result).toEqual([]);
  });

  it("keeps a long-ago-fired hook event that we only just started retrying", () => {
    // Restart recovery: event.timestamp is hours old, but firstSeenAt is now
    // — the previous bug keyed the TTL off event.timestamp and dropped these
    // on the first missed poll after restart.
    const twoHoursAgo = new Date(NOW - 2 * 60 * 60 * 1000).toISOString();
    const oldFire = pending(
      event({ pid: 111, timestamp: twoHoursAgo }),
      NOW, // first seen on this restart's poll
    );
    // Still within the retry window measured from firstSeenAt
    expect(pruneUnmatchedEvents([oldFire], [], NOW + 60_000)).toEqual([
      oldFire,
    ]);
  });

  it("only carries forward events that are both unmatched and within retry TTL", () => {
    const matched = pending(event({ pid: 111, sessionId: "matched" }));
    const unmatchedFresh = pending(
      event({ pid: 222, sessionId: "fresh" }),
      NOW,
    );
    const unmatchedExpired = pending(
      event({ pid: 333, sessionId: "stale" }),
      NOW - 20 * 60 * 1000,
    );
    const result = pruneUnmatchedEvents(
      [matched, unmatchedFresh, unmatchedExpired],
      [{ terminalId: "t1", event: matched.event }],
      NOW,
    );
    expect(result).toEqual([unmatchedFresh]);
  });

  it("keeps freshly-seen unmatched events even when pid is not yet live", () => {
    // Cursor shebang race: hook fires before agentPgid sticks / while leader
    // is still "bash". Must not drop within HOOK_PID_GRACE_MS.
    const early = pending(event({ pid: 999, sessionId: "early" }), NOW);
    const result = pruneUnmatchedEvents(
      [early],
      [],
      NOW + 5_000,
      new Set([111]),
    );
    expect(result).toEqual([early]);
  });

  it("drops unmatched events whose pid is not among live terminal pgids after grace", () => {
    const live = pending(event({ pid: 111, sessionId: "live" }), NOW);
    const dead = pending(event({ pid: 999, sessionId: "dead" }), NOW);
    const result = pruneUnmatchedEvents(
      [live, dead],
      [],
      NOW + 31_000,
      new Set([111]),
    );
    expect(result).toEqual([live]);
  });

  it("keeps unmatched events when the live pid set is empty (pgids not seeded yet)", () => {
    const pendingEvt = pending(event({ pid: 111 }));
    expect(pruneUnmatchedEvents([pendingEvt], [], NOW, new Set())).toEqual([
      pendingEvt,
    ]);
  });
});

describe("selectEventsJsonlLinesToKeep", () => {
  it("drops matched session ids and aged lines, keeps recent unmatched", () => {
    const recent = JSON.stringify({
      pid: 1,
      sessionId: "keep-me",
      cwd: "/tmp",
      agent: "claude",
      timestamp: new Date(NOW).toISOString(),
    });
    const matched = JSON.stringify({
      pid: 2,
      sessionId: "already-applied",
      cwd: "/tmp",
      agent: "codex",
      timestamp: new Date(NOW).toISOString(),
    });
    const aged = JSON.stringify({
      pid: 3,
      sessionId: "too-old",
      cwd: "/tmp",
      agent: "claude",
      timestamp: new Date(NOW - 48 * 60 * 60 * 1000).toISOString(),
    });
    const kept = selectEventsJsonlLinesToKeep(
      [recent, matched, aged],
      NOW,
      24 * 60 * 60 * 1000,
      100,
      new Set(["already-applied"]),
    );
    expect(kept).toEqual([recent]);
  });

  it("caps at maxLines keeping the most recent", () => {
    const lines = [1, 2, 3].map((n) =>
      JSON.stringify({
        pid: n,
        sessionId: `s${n}`,
        cwd: "/tmp",
        agent: "claude",
        timestamp: new Date(NOW + n * 1000).toISOString(),
      }),
    );
    const kept = selectEventsJsonlLinesToKeep(lines, NOW + 10_000, 60_000, 2);
    expect(kept).toEqual([lines[1], lines[2]]);
  });
});

describe("stampNewHookEvents", () => {
  it("stamps each event with the given firstSeenAt", () => {
    const events = [event({ pid: 1 }), event({ pid: 2 })];
    expect(stampNewHookEvents(events, 42)).toEqual([
      { event: events[0], firstSeenAt: 42 },
      { event: events[1], firstSeenAt: 42 },
    ]);
  });
});

describe("pickEarliestMatchPerTerminal", () => {
  it("keeps the earliest SessionStart when a later probe matches the same terminal", () => {
    const real = {
      terminalId: "t1",
      event: event({
        sessionId: "019fa9d2-real",
        timestamp: "2026-07-28T17:43:29.000Z",
      }),
    };
    const probe = {
      terminalId: "t1",
      event: event({
        sessionId: "CODEX-PROBE-1",
        timestamp: "2026-07-28T17:44:00.000Z",
      }),
    };
    // Probe listed first — still lose to earlier timestamp.
    expect(pickEarliestMatchPerTerminal([probe, real])).toEqual([real]);
  });

  it("keeps one earliest match per terminal across many terminals", () => {
    const a1 = {
      terminalId: "t1",
      event: event({
        sessionId: "a-early",
        timestamp: "2026-07-28T10:00:00.000Z",
      }),
    };
    const a2 = {
      terminalId: "t1",
      event: event({
        sessionId: "a-late",
        timestamp: "2026-07-28T11:00:00.000Z",
      }),
    };
    const b = {
      terminalId: "t2",
      event: event({
        pid: 222,
        sessionId: "b",
        timestamp: "2026-07-28T10:30:00.000Z",
      }),
    };
    const result = pickEarliestMatchPerTerminal([a2, b, a1]);
    expect(result).toHaveLength(2);
    expect(result.find((m) => m.terminalId === "t1")).toEqual(a1);
    expect(result.find((m) => m.terminalId === "t2")).toEqual(b);
  });
});

describe("shouldAcceptHookSessionId", () => {
  const early = {
    sessionId: "019fa9d2-real",
    timestamp: "2026-07-28T17:43:29.000Z",
  };
  const late = {
    sessionId: "CODEX-PROBE",
    timestamp: "2026-07-28T17:44:00.000Z",
  };

  it("accepts the first confirmation", () => {
    expect(shouldAcceptHookSessionId(null, null, early)).toBe(true);
    expect(shouldAcceptHookSessionId(undefined, undefined, early)).toBe(true);
  });

  it("rejects a later probe once an earlier SessionStart is stamped", () => {
    expect(
      shouldAcceptHookSessionId(early.sessionId, early.timestamp, late),
    ).toBe(false);
  });

  it("allows an earlier SessionStart to replace a wrongly restored probe", () => {
    // Restored from disk: probe id, no hook timestamp yet.
    expect(shouldAcceptHookSessionId(late.sessionId, null, early)).toBe(true);
  });

  it("allows an earlier timestamp to replace even when stamped", () => {
    expect(
      shouldAcceptHookSessionId(late.sessionId, late.timestamp, early),
    ).toBe(true);
  });

  it("treats an identical id as acceptable (caller stamps timestamp)", () => {
    expect(shouldAcceptHookSessionId(early.sessionId, null, early)).toBe(true);
  });
});

describe("hookEventCompatibleWithStickyAgent", () => {
  it("allows any hook when no sticky agent is set yet", () => {
    expect(hookEventCompatibleWithStickyAgent("claude", null)).toBe(true);
  });

  it("allows a hook whose agent matches the sticky foreground agent", () => {
    expect(hookEventCompatibleWithStickyAgent("claude", "claude")).toBe(true);
    expect(hookEventCompatibleWithStickyAgent("grok", "grok")).toBe(true);
  });

  it("rejects Claude hooks against a Grok sticky foreground (Claude-compat import)", () => {
    // Grok re-fires ~/.claude/settings.json SessionStart hooks tagged
    // agent:"claude" against Grok's own pid — must not claim the terminal.
    expect(hookEventCompatibleWithStickyAgent("claude", "grok")).toBe(false);
  });
});

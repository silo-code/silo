import { describe, it, expect } from "vitest";
import {
  isWorkUpdate,
  turnEndMarker,
  toolCallFlight,
  TURN_QUIESCENCE_MS,
  TURN_BACKSTOP_MS,
} from "./chat-turn-signals";
import type { AcpSessionUpdate } from "./acp-jsonrpc";

const u = (v: Record<string, unknown>) => v as unknown as AcpSessionUpdate;

describe("isWorkUpdate", () => {
  it("counts the kinds that carry actual work", () => {
    for (const kind of [
      "user_message_chunk",
      "agent_message_chunk",
      "agent_thought_chunk",
      "tool_call",
      "tool_call_update",
      "plan",
    ]) {
      expect(isWorkUpdate(u({ sessionUpdate: kind })), kind).toBe(true);
    }
  });

  // The asymmetry this allow-list exists for. `claude-agent-acp` regenerates
  // the conversation title from its own `onTurnEnd` hook, so this frame lands
  // immediately *after* every turn ends — counting it as work would re-promote
  // the session the instant the host demoted it, forever.
  it("does not count the metadata an agent emits at turn-over", () => {
    for (const kind of [
      "session_info_update",
      "usage_update",
      "available_commands_update",
      "current_mode_update",
      "config_option_update",
    ]) {
      expect(isWorkUpdate(u({ sessionUpdate: kind })), kind).toBe(false);
    }
  });

  it("does not count an unknown kind — a missed turn start beats a turn that never ends", () => {
    expect(isWorkUpdate(u({ sessionUpdate: "some_vendor_frame" }))).toBe(false);
  });
});

describe("turnEndMarker", () => {
  // The exact frames observed on the wire 2026-10-06 (dev app journal
  // c5d278e1): one marker per turn, carrying both the cost and the provenance.
  const humanMarker = u({
    sessionUpdate: "usage_update",
    used: 25513,
    size: 200000,
    cost: { amount: 0.054749500000000006, currency: "USD" },
    _meta: { "_claude/origin": { kind: "human" } },
  });
  const notificationMarker = u({
    sessionUpdate: "usage_update",
    used: 26523,
    size: 200000,
    cost: { amount: 0.061042900000000004, currency: "USD" },
    _meta: { "_claude/origin": { kind: "task-notification" } },
  });

  it("reads the host-prompted turn's marker as human", () => {
    expect(turnEndMarker(humanMarker)).toEqual({ origin: "human" });
  });

  it("reads every other provenance as an agent-initiated turn", () => {
    expect(turnEndMarker(notificationMarker)).toEqual({ origin: "agent" });
    expect(
      turnEndMarker(
        u({
          sessionUpdate: "usage_update",
          cost: { amount: 0.01, currency: "USD" },
          _meta: { "_claude/origin": { kind: "something-new" } },
        }),
      ),
    ).toEqual({ origin: "agent" });
  });

  // The regression. `claude-agent-acp@0.75.1` ends an agent-initiated turn
  // with a cost-bearing `usage_update` and no `_meta` at all — the exact last
  // frame of prod journal 2c4ce3fd, which left its tab reading "Working" for
  // 33 minutes after the agent had finished talking. The `cost` is the
  // boundary; the origin is provenance layered on top when the agent bothers.
  it("reads a cost-bearing frame as a boundary even with no provenance", () => {
    expect(
      turnEndMarker(
        u({
          sessionUpdate: "usage_update",
          used: 190027,
          size: 1000000,
          cost: { amount: 4.631994800000001, currency: "USD" },
        }),
      ),
    ).toEqual({ origin: undefined });
  });

  it("still reads one whose meta carries something other than an origin", () => {
    // The shape of every mid-turn frame in that journal — except this one also
    // has the per-turn `cost`.
    expect(
      turnEndMarker(
        u({
          sessionUpdate: "usage_update",
          cost: { amount: 4.5, currency: "USD" },
          _meta: { "_claude/rateLimit": { status: "allowed" } },
        }),
      ),
    ).toEqual({ origin: undefined });
  });

  it("ignores the mid-turn usage updates, which carry neither", () => {
    // Nine `usage_update` frames in that session, only two of them markers.
    expect(
      turnEndMarker(u({ sessionUpdate: "usage_update", used: 25264 })),
    ).toBeUndefined();
    expect(
      turnEndMarker(
        u({
          sessionUpdate: "usage_update",
          used: 25264,
          _meta: { "_claude/rateLimit": { status: "allowed" } },
        }),
      ),
    ).toBeUndefined();
  });

  it("only ever reads the marker off a usage_update", () => {
    expect(
      turnEndMarker(
        u({
          sessionUpdate: "agent_message_chunk",
          cost: { amount: 1, currency: "USD" },
          _meta: { "_claude/origin": { kind: "human" } },
        }),
      ),
    ).toBeUndefined();
  });

  it("survives junk where the cost should be", () => {
    for (const cost of [null, 0.5, "0.5", [1, 2]]) {
      expect(
        turnEndMarker(u({ sessionUpdate: "usage_update", cost })),
        JSON.stringify(cost),
      ).toBeUndefined();
    }
  });

  it("survives junk where the meta should be, falling back to the cost", () => {
    expect(turnEndMarker(u({ sessionUpdate: "usage_update" }))).toBeUndefined();
    for (const meta of [
      null,
      [1, 2],
      { "_claude/origin": 7 },
      { "_claude/origin": { kind: 7 } },
    ]) {
      const label = JSON.stringify(meta);
      expect(
        turnEndMarker(u({ sessionUpdate: "usage_update", _meta: meta })),
        label,
      ).toBeUndefined();
      // Unreadable provenance is not a reason to drop the boundary.
      expect(
        turnEndMarker(
          u({
            sessionUpdate: "usage_update",
            cost: { amount: 1, currency: "USD" },
            _meta: meta,
          }),
        ),
        label,
      ).toEqual({ origin: undefined });
    }
  });
});

describe("toolCallFlight", () => {
  it("opens flight on a tool_call", () => {
    expect(
      toolCallFlight(
        u({ sessionUpdate: "tool_call", toolCallId: "t1", status: "pending" }),
      ),
    ).toEqual({ toolCallId: "t1", inFlight: true });
  });

  it("treats a statusless tool_call as a call starting anyway", () => {
    expect(
      toolCallFlight(u({ sessionUpdate: "tool_call", toolCallId: "t1" })),
    ).toEqual({ toolCallId: "t1", inFlight: true });
  });

  // The whole reason this returns `undefined` rather than a boolean. The
  // observed shape for one call is `tool_call{pending}`, then several
  // `tool_call_update`s carrying only a title or content, then a final
  // `tool_call_update{completed}`. Reading "no status" as "settled" would clear
  // a live call on its first content frame and let the turn end mid-tool.
  it("says nothing about flight for an intermediate update with no status", () => {
    expect(
      toolCallFlight(
        u({
          sessionUpdate: "tool_call_update",
          toolCallId: "t1",
          title: "sleep 40; echo DONE",
        }),
      ),
    ).toBeUndefined();
  });

  it("closes flight on each settled status", () => {
    for (const status of ["completed", "failed", "cancelled"]) {
      expect(
        toolCallFlight(
          u({ sessionUpdate: "tool_call_update", toolCallId: "t1", status }),
        ),
        status,
      ).toEqual({ toolCallId: "t1", inFlight: false });
    }
  });

  it("keeps flight open for a still-running status", () => {
    expect(
      toolCallFlight(
        u({
          sessionUpdate: "tool_call_update",
          toolCallId: "t1",
          status: "in_progress",
        }),
      ),
    ).toEqual({ toolCallId: "t1", inFlight: true });
  });

  it("ignores updates that are not about a tool call, or name no call", () => {
    expect(
      toolCallFlight(u({ sessionUpdate: "agent_message_chunk" })),
    ).toBeUndefined();
    expect(
      toolCallFlight(u({ sessionUpdate: "tool_call", toolCallId: "" })),
    ).toBeUndefined();
    expect(
      toolCallFlight(u({ sessionUpdate: "tool_call", toolCallId: 7 })),
    ).toBeUndefined();
  });
});

it("gives a quiet turn longer than the terminal path's shell-idle fallback", () => {
  // Not a magic number to keep in two places — the point is only that a whole
  // turn gets more silence than a shell zone does (SHELL_IDLE_MS, 3s), because
  // a model composing its next tool call goes quiet for seconds at a time.
  expect(TURN_QUIESCENCE_MS).toBeGreaterThan(3_000);
});

it("gives an agent that marks its turn ends a far longer leash, but a finite one", () => {
  // Same point, one level up: the backstop exists only to catch a marker that
  // never came, so it has to be long enough never to race a real one — and
  // finite, because an infinite one is the bug it was written for.
  expect(TURN_BACKSTOP_MS).toBeGreaterThan(TURN_QUIESCENCE_MS);
  expect(Number.isFinite(TURN_BACKSTOP_MS)).toBe(true);
});

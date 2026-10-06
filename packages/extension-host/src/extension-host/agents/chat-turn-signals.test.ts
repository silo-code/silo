import { describe, it, expect } from "vitest";
import {
  isWorkUpdate,
  turnEndOrigin,
  toolCallFlight,
  TURN_QUIESCENCE_MS,
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

describe("turnEndOrigin", () => {
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
    expect(turnEndOrigin(humanMarker)).toBe("human");
  });

  it("reads every other provenance as an agent-initiated turn", () => {
    expect(turnEndOrigin(notificationMarker)).toBe("agent");
    expect(
      turnEndOrigin(
        u({
          sessionUpdate: "usage_update",
          _meta: { "_claude/origin": { kind: "something-new" } },
        }),
      ),
    ).toBe("agent");
  });

  it("ignores the mid-turn usage updates, which carry no origin", () => {
    // Nine `usage_update` frames in that session, only two of them markers.
    expect(
      turnEndOrigin(u({ sessionUpdate: "usage_update", used: 25264 })),
    ).toBeUndefined();
  });

  it("only ever reads the marker off a usage_update", () => {
    expect(
      turnEndOrigin(
        u({
          sessionUpdate: "agent_message_chunk",
          _meta: { "_claude/origin": { kind: "human" } },
        }),
      ),
    ).toBeUndefined();
  });

  it("survives junk where the meta should be", () => {
    expect(turnEndOrigin(u({ sessionUpdate: "usage_update" }))).toBeUndefined();
    expect(
      turnEndOrigin(u({ sessionUpdate: "usage_update", _meta: null })),
    ).toBeUndefined();
    expect(
      turnEndOrigin(u({ sessionUpdate: "usage_update", _meta: [1, 2] })),
    ).toBeUndefined();
    expect(
      turnEndOrigin(
        u({ sessionUpdate: "usage_update", _meta: { "_claude/origin": 7 } }),
      ),
    ).toBeUndefined();
    expect(
      turnEndOrigin(
        u({
          sessionUpdate: "usage_update",
          _meta: { "_claude/origin": { kind: 7 } },
        }),
      ),
    ).toBeUndefined();
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

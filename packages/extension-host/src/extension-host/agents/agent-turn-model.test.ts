import { describe, it, expect } from "vitest";
import {
  beginTurn,
  endTurn,
  witnessTurn,
  type TurnPhase,
} from "./agent-turn-model";

function phase(over: Partial<TurnPhase> = {}): TurnPhase {
  return {
    activity: "none",
    needsAttention: false,
    attentionSince: null,
    workingSince: null,
    ...over,
  };
}

describe("beginTurn", () => {
  it("stamps workingSince and supersedes an unread finish", () => {
    const next = beginTurn(
      phase({
        activity: "idle",
        needsAttention: true,
        attentionSince: "t0",
      }),
      "t1",
    );
    expect(next.activity).toBe("working");
    expect(next.workingSince).toBe("t1");
    expect(next.needsAttention).toBe(false);
    expect(next.attentionSince).toBeNull();
  });
});

describe("endTurn — the one attention rule", () => {
  const working = phase({ activity: "working", workingSince: "t0" });

  it("raises attention for a finish nobody witnessed", () => {
    const next = endTurn(working, {
      now: "t1",
      isAgent: true,
      witnessed: false,
      outcome: "finished",
    });
    expect(next.activity).toBe("idle");
    expect(next.needsAttention).toBe(true);
    expect(next.attentionSince).toBe("t1");
    expect(next.workingSince).toBeNull();
  });

  it("does not raise for a finish the user watched", () => {
    const next = endTurn(working, {
      now: "t1",
      isAgent: true,
      witnessed: true,
      outcome: "finished",
    });
    expect(next.activity).toBe("idle");
    expect(next.needsAttention).toBe(false);
    expect(next.attentionSince).toBeNull();
  });

  it("does not raise for a non-agent", () => {
    const next = endTurn(working, {
      now: "t1",
      isAgent: false,
      witnessed: false,
      outcome: "finished",
    });
    expect(next.needsAttention).toBe(false);
  });

  it("a cancelled turn is idle and never wants attention — the user was there", () => {
    const next = endTurn(working, {
      now: "t1",
      isAgent: true,
      witnessed: false,
      outcome: "cancelled",
    });
    expect(next.activity).toBe("idle");
    expect(next.needsAttention).toBe(false);
  });

  it("a failed turn is error, and leaves attention exactly as it was", () => {
    const failedFresh = endTurn(working, {
      now: "t1",
      isAgent: true,
      witnessed: false,
      outcome: "failed",
    });
    expect(failedFresh.activity).toBe("error");
    expect(failedFresh.needsAttention).toBe(false);

    const failedOverPending = endTurn(
      phase({
        activity: "working",
        needsAttention: true,
        attentionSince: "t0",
      }),
      { now: "t1", isAgent: true, witnessed: false, outcome: "failed" },
    );
    expect(failedOverPending.needsAttention).toBe(true);
    expect(failedOverPending.attentionSince).toBe("t0");
  });

  it("an end with no turn running never touches a pending finish", () => {
    const pending = phase({
      activity: "idle",
      needsAttention: true,
      attentionSince: "t0",
    });
    const next = endTurn(pending, {
      now: "t9",
      isAgent: true,
      witnessed: true,
      outcome: "finished",
    });
    expect(next.needsAttention).toBe(true);
    expect(next.attentionSince).toBe("t0");
  });
});

describe("witnessTurn", () => {
  it("clears a pending finish", () => {
    const next = witnessTurn(
      phase({ activity: "idle", needsAttention: true, attentionSince: "t0" }),
    );
    expect(next.needsAttention).toBe(false);
    expect(next.attentionSince).toBeNull();
  });

  it("returns the same object when nothing was pending, so callers can skip a notify", () => {
    const prev = phase({ activity: "idle" });
    expect(witnessTurn(prev)).toBe(prev);
  });
});

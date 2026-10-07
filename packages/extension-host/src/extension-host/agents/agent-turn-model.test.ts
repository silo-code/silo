import { describe, it, expect } from "vitest";
import {
  beginTurn,
  endTurn,
  restoredIdleSince,
  witnessTurn,
  type TurnPhase,
} from "./agent-turn-model";

function phase(over: Partial<TurnPhase> = {}): TurnPhase {
  return {
    activity: "none",
    needsAttention: false,
    attentionSince: null,
    workingSince: null,
    idleSince: null,
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

  it("clears idleSince — a running turn has no idle duration", () => {
    const next = beginTurn(phase({ activity: "idle", idleSince: "t0" }), "t1");
    expect(next.idleSince).toBeNull();
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

  // The asymmetry that makes idleSince worth having: acknowledging answers
  // "is it unread", not "when did it stop" — and a just-acknowledged row is
  // exactly the one that still needs its age (RFC 0056).
  it("leaves idleSince alone — looking at a finish does not move when it happened", () => {
    const next = witnessTurn(
      phase({
        activity: "idle",
        needsAttention: true,
        attentionSince: "t0",
        idleSince: "t0",
      }),
    );
    expect(next.attentionSince).toBeNull();
    expect(next.idleSince).toBe("t0");
  });
});

// RFC 0056. The field a "done" row dates itself from: set at the working →
// stopped edge and nowhere else, for every outcome.
describe("endTurn — idleSince", () => {
  const working = phase({ activity: "working", workingSince: "t0" });

  it.each(["finished", "cancelled", "failed"] as const)(
    "stamps the stop time for a %s turn — all three mean it stopped working",
    (outcome) => {
      const next = endTurn(working, {
        now: "t1",
        isAgent: true,
        witnessed: false,
        outcome,
      });
      expect(next.idleSince).toBe("t1");
    },
  );

  // A repeated OSC tick or a stray detector reporting idle-from-idle must not
  // walk the timestamp forward — that would re-date a days-old finish to now
  // on every tick, which is the whole failure this field replaced.
  it("does not re-stamp a session that had already stopped", () => {
    const next = endTurn(phase({ activity: "idle", idleSince: "t0" }), {
      now: "t9",
      isAgent: true,
      witnessed: false,
      outcome: "finished",
    });
    expect(next.idleSince).toBe("t0");
  });

  // Dave's report (2026-10-06), third round: two reattached terminal rows had
  // no duration at all. A reattached terminal replays its OSC scrollback as an
  // idle prompt against a state machine that starts at "none", so its only
  // transition is none → idle — not a working → stopped edge. Gating purely
  // on `wasWorking` left those rows with no timestamp, permanently.
  it("stamps the first time a session is seen stopped, even with no edge to key on", () => {
    const next = endTurn(phase({ activity: "none" }), {
      now: "t1",
      isAgent: true,
      witnessed: false,
      outcome: "finished",
    });
    expect(next.idleSince).toBe("t1");
  });

  it("holds that first observation against later idle-from-idle ticks", () => {
    const first = endTurn(phase({ activity: "none" }), {
      now: "t1",
      isAgent: true,
      witnessed: false,
      outcome: "finished",
    });
    const later = endTurn(
      { ...first, activity: "idle" },
      {
        now: "t9",
        isAgent: true,
        witnessed: false,
        outcome: "finished",
      },
    );
    expect(later.idleSince).toBe("t1");
  });

  // The floor never beats real information: a restored stamp (or
  // restoredIdleSince's estimate) is already in `prev` and survives.
  it("never overrides a restored stamp with the first-seen floor", () => {
    const next = endTurn(phase({ activity: "none", idleSince: "t-restored" }), {
      now: "t9",
      isAgent: true,
      witnessed: false,
      outcome: "finished",
    });
    expect(next.idleSince).toBe("t-restored");
  });
});

// RFC 0056. The restore-time estimate, shared by both kinds. Its absence is
// what made the first cut of this change blank every pre-existing row: no
// record written before `idleSince` existed carries one, so without a
// fallback every settled session lost its duration until it ran again.
describe("restoredIdleSince", () => {
  const lastLiveAt = "2026-10-01T16:15:17.012Z";

  it("prefers a precise stamp over the estimate", () => {
    expect(
      restoredIdleSince({ stopped: true, idleSince: "t-exact", lastLiveAt }),
    ).toBe("t-exact");
  });

  it("falls back to lastLiveAt for a stopped session with no stamp", () => {
    expect(restoredIdleSince({ stopped: true, lastLiveAt })).toBe(lastLiveAt);
  });

  it("treats a null stamp the same as a missing one", () => {
    expect(
      restoredIdleSince({ stopped: true, idleSince: null, lastLiveAt }),
    ).toBe(lastLiveAt);
  });

  // A Terminal session restores `working` as-is, so its real finish still
  // arrives through endTurn — estimating one now would be overwritten anyway,
  // and `workingSince` is the field that row actually reads.
  it("reports nothing for a session that comes back still working", () => {
    expect(restoredIdleSince({ stopped: false, lastLiveAt })).toBeNull();
  });

  it("still prefers a precise stamp even when it comes back working", () => {
    expect(
      restoredIdleSince({ stopped: false, idleSince: "t-exact", lastLiveAt }),
    ).toBe("t-exact");
  });
});

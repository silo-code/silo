import { describe, it, expect } from "vitest";
import {
  initialState,
  reduce,
  deriveStatusRow,
  deriveTabBadge,
  stripStatusMarker,
  toPersisted,
  restoreState,
  STALE_THRESHOLD_MS,
  type AgentEvent,
  type TerminalAgentState,
} from "./agent-status";

const T0 = "2026-07-03T10:00:00.000Z";
const T1 = "2026-07-03T10:05:00.000Z";

function detected(
  status: Extract<AgentEvent, { type: "detected" }>["status"],
  source: Extract<AgentEvent, { type: "detected" }>["source"],
  opts: { active?: boolean; now?: string } = {},
): AgentEvent {
  return {
    type: "detected",
    status,
    source,
    isActiveTerminal: opts.active ?? false,
    now: opts.now ?? T0,
  };
}

/** Fold a sequence of events over an initial state. */
function run(start: TerminalAgentState, ...events: AgentEvent[]) {
  return events.reduce(reduce, start);
}

describe("initialState", () => {
  it("marks claude/pi terminals as agents from birth", () => {
    expect(initialState("claude").isAgent).toBe(true);
    expect(initialState("pi").isAgent).toBe(true);
  });

  it("marks shell terminals as non-agents", () => {
    expect(initialState("shell").isAgent).toBe(false);
  });
});

describe("promotion and demotion", () => {
  it("promotes a shell terminal when an agent detector fires", () => {
    const s = run(initialState("shell"), detected("working", "agent"));
    expect(s.isAgent).toBe(true);
  });

  it("never promotes on plain shell-integration events", () => {
    const s = run(initialState("shell"), detected("working", "shell"));
    expect(s.isAgent).toBe(false);
  });

  it("never promotes on timer events", () => {
    const s = run(initialState("shell"), detected("waiting", "timer"));
    expect(s.isAgent).toBe(false);
  });

  it("demotes a promoted shell terminal once shell traffic resumes", () => {
    // claude runs in a zsh tab (promoted), finishes, the user views it, then
    // the user runs a plain shell command → back to non-agent.
    const s = run(
      initialState("shell"),
      detected("working", "agent"),
      detected("waiting", "agent"),
      { type: "activated" },
      detected("working", "shell"),
    );
    expect(s.isAgent).toBe(false);
  });

  it("defers demotion while attention is pending", () => {
    // The agent exits straight back to the shell prompt: the 133 event both
    // ends the working phase (setting attention) and is shell traffic. The
    // unseen "agent finished" must survive.
    const s = run(
      initialState("shell"),
      detected("working", "agent"),
      detected("waiting", "shell"),
    );
    expect(s.isAgent).toBe(true);
    expect(s.needsAttention).toBe(true);
  });

  it("never demotes kind-claude/pi terminals on shell traffic", () => {
    // pi is driven by OSC 133 (source "shell") — its kind keeps it an agent.
    const s = run(
      initialState("pi"),
      detected("working", "shell"),
      detected("waiting", "shell"),
      { type: "activated" },
      detected("working", "shell"),
    );
    expect(s.isAgent).toBe(true);
  });
});

describe("working state", () => {
  it("stamps workingSince on entering working", () => {
    const s = run(initialState("claude"), detected("working", "agent"));
    expect(s.activity).toBe("working");
    expect(s.workingSince).toBe(T0);
  });

  it("returns prev by identity for repeated working events", () => {
    // Claude Code's braille spinner fires one OSC 0 per animation frame; the
    // identity check is what prevents an invalidate storm.
    const s1 = run(initialState("claude"), detected("working", "agent"));
    const s2 = reduce(s1, detected("working", "agent", { now: T1 }));
    expect(s2).toBe(s1);
    expect(s2.workingSince).toBe(T0);
  });

  it("re-entering working restamps workingSince and clears attention", () => {
    const s = run(
      initialState("claude"),
      detected("working", "agent"),
      detected("waiting", "agent"),
      detected("working", "agent", { now: T1 }),
    );
    expect(s.needsAttention).toBe(false);
    expect(s.attentionSince).toBeNull();
    expect(s.workingSince).toBe(T1);
  });

  it("shell events cannot pull a born-agent out of working (flicker fix)", () => {
    // Claude Code subprocess tool calls emit OSC 133;A/D from the inner shell.
    // Those arrive as source:"shell" status:"waiting" — they must not override
    // the agent-driven "working" state, which only an agent-source event ends.
    const s = run(
      initialState("claude"),
      detected("working", "agent"),
      detected("waiting", "shell"), // subprocess shell-integration noise
      detected("waiting", "shell"), // another one
    );
    expect(s.activity).toBe("working");
    expect(s.workingSince).toBe(T0);
    expect(s.needsAttention).toBe(false);
  });

  it("timer events cannot pull a born-agent out of agent-sourced working", () => {
    // When the terminal tab goes to the background, OSC streaming pauses and
    // the shell idle timer fires. That must not produce a false "needs attention"
    // for Claude Code — only the explicit ✳ idle signal (agent-source) ends it.
    const s = run(
      initialState("claude"),
      detected("working", "agent"),
      detected("waiting", "timer"), // shell idle timer fires (background / OSC pause)
    );
    expect(s.activity).toBe("working");
    expect(s.needsAttention).toBe(false);
  });

  it("timer events cannot pull a promoted shell terminal out of agent-sourced working", () => {
    // Claude Code typed into a plain shell terminal: kind="shell" but promoted
    // to agent by the braille spinner. The same tab-switch false-positive applies —
    // workingSource="agent" blocks the timer regardless of kind.
    const s = run(
      initialState("shell"),
      detected("working", "agent"), // braille spinner promotes + sets workingSource
      detected("waiting", "timer"), // shell idle timer fires (background / OSC pause)
    );
    expect(s.activity).toBe("working");
    expect(s.needsAttention).toBe(false);
  });

  it("pi can be driven into working by shell events", () => {
    // pi uses OSC 133;C (source:"shell", status:"working"); the timer ends it.
    const s = run(initialState("pi"), detected("working", "shell"));
    expect(s.activity).toBe("working");
    expect(s.isAgent).toBe(true);
  });

  it("timer events CAN end pi's shell-sourced working phase", () => {
    // pi never emits an explicit done signal; the 3-second idle timer is its
    // intended demotion mechanism. workingSource === "shell" so timer is allowed.
    const s = run(
      initialState("pi"),
      detected("working", "shell"),
      detected("waiting", "timer"),
    );
    expect(s.activity).toBe("waiting");
  });

  it("born-agent working state ends on agent-source waiting", () => {
    // The actual idle signal from Claude Code (✳) should still end working.
    const s = run(
      initialState("claude"),
      detected("working", "agent"),
      detected("waiting", "agent"),
    );
    expect(s.activity).toBe("waiting");
  });
});

describe("needs attention", () => {
  it("is set when working stops while the terminal is not active", () => {
    const s = run(
      initialState("claude"),
      detected("working", "agent"),
      detected("waiting", "agent", { now: T1 }),
    );
    expect(s.needsAttention).toBe(true);
    expect(s.attentionSince).toBe(T1);
    expect(s.workingSince).toBeNull();
  });

  it("is set on working → done as well", () => {
    const s = run(
      initialState("claude"),
      detected("working", "agent"),
      detected("done", "agent"),
    );
    expect(s.needsAttention).toBe(true);
  });

  it("is suppressed when the terminal is the active tab", () => {
    const s = run(
      initialState("claude"),
      detected("working", "agent"),
      detected("waiting", "agent", { active: true }),
    );
    expect(s.needsAttention).toBe(false);
  });

  it("is not set without a preceding working phase", () => {
    // A freshly opened agent sitting at its prompt emits "waiting" signals.
    const s = run(initialState("claude"), detected("waiting", "agent"));
    expect(s.needsAttention).toBe(false);
  });

  it("is sticky across further waiting events", () => {
    const s = run(
      initialState("claude"),
      detected("working", "agent"),
      detected("waiting", "agent"),
      detected("waiting", "timer"),
      detected("waiting", "agent"),
    );
    expect(s.needsAttention).toBe(true);
  });

  it("attentionSince is pinned to when it first became true, not reset by further waiting events", () => {
    const s = run(
      initialState("claude"),
      detected("working", "agent"),
      detected("waiting", "agent", { now: T1 }),
      detected("waiting", "timer"),
      detected("waiting", "agent"),
    );
    expect(s.attentionSince).toBe(T1);
  });

  it("is cleared by activation, along with attentionSince", () => {
    const s = run(
      initialState("claude"),
      detected("working", "agent"),
      detected("waiting", "agent"),
      { type: "activated" },
    );
    expect(s.needsAttention).toBe(false);
    expect(s.attentionSince).toBeNull();
  });

  it("activation is a no-op (by identity) when nothing is pending", () => {
    const s1 = run(initialState("claude"), detected("waiting", "agent"));
    expect(reduce(s1, { type: "activated" })).toBe(s1);
  });

  it("is set by the idle-timer fallback ending a working phase", () => {
    // pi never emits an explicit done signal; the debounce timer does it.
    const s = run(
      initialState("pi"),
      detected("working", "shell"),
      detected("waiting", "timer"),
    );
    expect(s.needsAttention).toBe(true);
  });
});

describe("deriveStatusRow", () => {
  it("returns a busy row with startedAt while an agent works", () => {
    const s = run(initialState("claude"), detected("working", "agent"));
    expect(deriveStatusRow(s)).toEqual({ status: "busy", startedAt: T0 });
  });

  it("returns a warn row with startedAt while attention is pending", () => {
    const s = run(
      initialState("claude"),
      detected("working", "agent"),
      detected("waiting", "agent", { now: T1 }),
    );
    expect(deriveStatusRow(s)).toEqual({ status: "warn", startedAt: T1 });
  });

  it("returns null for idle agents", () => {
    expect(deriveStatusRow(initialState("claude"))).toBeNull();
    const viewed = run(
      initialState("claude"),
      detected("working", "agent"),
      detected("waiting", "agent"),
      { type: "activated" },
    );
    expect(deriveStatusRow(viewed)).toBeNull();
  });

  it("returns null for shells, even busy ones", () => {
    const s = run(initialState("shell"), detected("working", "shell"));
    expect(deriveStatusRow(s)).toBeNull();
  });
});

describe("deriveTabBadge", () => {
  it("maps agent states to badges", () => {
    const working = run(initialState("claude"), detected("working", "agent"));
    expect(deriveTabBadge(working)).toBe("working");

    const attention = run(working, detected("waiting", "agent"));
    expect(deriveTabBadge(attention)).toBe("attention");

    const viewed = reduce(attention, { type: "activated" });
    expect(deriveTabBadge(viewed)).toBe("waiting");

    expect(deriveTabBadge(initialState("claude"))).toBeNull();
  });

  it("returns null for shells, whatever their activity", () => {
    const s = run(initialState("shell"), detected("working", "shell"));
    expect(deriveTabBadge(s)).toBeNull();
  });
});

describe("stripStatusMarker", () => {
  it("strips a leading braille spinner glyph and its space", () => {
    expect(stripStatusMarker("⠐ agent-status-monitor")).toBe(
      "agent-status-monitor",
    );
    expect(stripStatusMarker("⠂ my-project")).toBe("my-project");
  });

  it("strips Claude's leading ✳ idle marker", () => {
    expect(stripStatusMarker("✳ agent-status-monitor")).toBe(
      "agent-status-monitor",
    );
  });

  it("strips Codex's leading action-required bracket markers", () => {
    expect(stripStatusMarker("[ ! ] my-project")).toBe("my-project");
    expect(stripStatusMarker("[ . ] my-project")).toBe("my-project");
  });

  it("leaves titles with no recognized marker untouched", () => {
    expect(stripStatusMarker("zsh")).toBe("zsh");
    expect(stripStatusMarker("my-project")).toBe("my-project");
  });

  it("only strips a single leading marker, not ones mid-string", () => {
    expect(stripStatusMarker("⠐ note about ✳ something")).toBe(
      "note about ✳ something",
    );
  });
});

describe("toPersisted / restoreState (app-restart persistence)", () => {
  const SHORT_GAP = 1_000; // well under STALE_THRESHOLD_MS
  const LONG_GAP = STALE_THRESHOLD_MS + 1;

  it("round-trips a working state, minus kind and stale", () => {
    const s = run(initialState("claude"), detected("working", "agent"));
    const persisted = toPersisted(s);
    expect(persisted).not.toHaveProperty("kind");
    expect(persisted).not.toHaveProperty("stale");
    expect(restoreState("claude", persisted, SHORT_GAP)).toEqual(s);
  });

  it("round-trips a needs-attention state", () => {
    const s = run(
      initialState("claude"),
      detected("working", "agent"),
      detected("waiting", "agent", { now: T1 }),
    );
    const restored = restoreState("claude", toPersisted(s), SHORT_GAP);
    expect(restored).toEqual(s);
    expect(restored.needsAttention).toBe(true);
    expect(restored.attentionSince).toBe(T1);
  });

  it("restores against the terminal's current kind, not a stale one", () => {
    // A shell terminal promoted to agent mid-session; on restart the terminal
    // record itself still reports kind "shell" — restoreState takes kind from
    // the caller (the live terminal record), not from the persisted blob.
    const s = run(initialState("shell"), detected("working", "agent"));
    const persisted = toPersisted(s);
    expect(restoreState("shell", persisted, SHORT_GAP).kind).toBe("shell");
  });

  it("falls back to initialState when nothing was persisted", () => {
    expect(restoreState("claude", undefined, LONG_GAP)).toEqual(
      initialState("claude"),
    );
  });

  it("marks a restored working state stale after a long gap", () => {
    const s = run(initialState("claude"), detected("working", "agent"));
    const restored = restoreState("claude", toPersisted(s), LONG_GAP);
    expect(restored.stale).toBe(true);
    expect(restored.activity).toBe("working"); // status/duration unaffected
  });

  it("marks a restored needs-attention state stale after a long gap", () => {
    const s = run(
      initialState("claude"),
      detected("working", "agent"),
      detected("waiting", "agent"),
    );
    expect(restoreState("claude", toPersisted(s), LONG_GAP).stale).toBe(true);
  });

  it("does not mark stale within the threshold", () => {
    const s = run(initialState("claude"), detected("working", "agent"));
    expect(restoreState("claude", toPersisted(s), SHORT_GAP).stale).toBe(false);
  });

  it("does not mark stale when not showing a duration, however long the gap", () => {
    // "waiting" with no pending attention derives no row — nothing for
    // staleness to qualify, regardless of the gap.
    const s = run(
      initialState("claude"),
      detected("working", "agent"),
      detected("waiting", "agent", { active: true }), // suppresses needsAttention
    );
    expect(restoreState("claude", toPersisted(s), LONG_GAP).stale).toBe(false);
  });

  it("reduce() clears a restored stale flag on the next non-timer detected event", () => {
    const s = run(initialState("claude"), detected("working", "agent"));
    const restored = restoreState("claude", toPersisted(s), LONG_GAP);
    expect(restored.stale).toBe(true);
    // Same status, same source — would otherwise be a no-op identity return,
    // but clearing `stale` must still count as a real change.
    const reconfirmed = reduce(restored, detected("working", "agent"));
    expect(reconfirmed).not.toBe(restored);
    expect(reconfirmed.stale).toBe(false);
  });

  it("a timer event does not clear a restored stale flag", () => {
    // pi's working→waiting demotion goes through the idle timer (shell-source
    // "waiting" is blocked for the same flicker-prevention rule that protects
    // born agents — see "working state" tests above).
    const s = run(
      initialState("pi"),
      detected("working", "shell"),
      detected("waiting", "timer"),
    );
    const restored = restoreState("pi", toPersisted(s), LONG_GAP);
    expect(restored.stale).toBe(true);
    const afterTimer = reduce(restored, detected("waiting", "timer"));
    expect(afterTimer.stale).toBe(true);
  });
});

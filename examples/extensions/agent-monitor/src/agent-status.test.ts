import { describe, it, expect } from "vitest";
import {
  initialState,
  reduce,
  deriveStatusRow,
  deriveTabBadge,
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
    expect(s.workingSince).toBe(T1);
  });
});

describe("needs attention", () => {
  it("is set when working stops while the terminal is not active", () => {
    const s = run(
      initialState("claude"),
      detected("working", "agent"),
      detected("waiting", "agent"),
    );
    expect(s.needsAttention).toBe(true);
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

  it("is cleared by activation", () => {
    const s = run(
      initialState("claude"),
      detected("working", "agent"),
      detected("waiting", "agent"),
      { type: "activated" },
    );
    expect(s.needsAttention).toBe(false);
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

  it("returns a warn row while attention is pending", () => {
    const s = run(
      initialState("claude"),
      detected("working", "agent"),
      detected("waiting", "agent"),
    );
    expect(deriveStatusRow(s)).toEqual({ status: "warn" });
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

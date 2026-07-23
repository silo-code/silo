import { describe, it, expect } from "vitest";
import {
  initialState,
  restoreState,
  reduce,
  clearResumeIdentityOnDemotion,
  STALE_THRESHOLD_MS,
  type AgentActivityState,
} from "./agent-activity-model";

function detected(
  status: "working" | "waiting" | "done" | "error",
  opts: Partial<{
    source: "agent" | "shell" | "timer";
    isActiveTerminal: boolean;
    now: string;
  }> = {},
) {
  return {
    type: "detected" as const,
    status,
    source: opts.source ?? "agent",
    isActiveTerminal: opts.isActiveTerminal ?? false,
    now: opts.now ?? "2026-01-01T00:00:00.000Z",
  };
}

describe("initialState", () => {
  it("born-agent kinds start isAgent, plain shells don't", () => {
    expect(initialState("claude").isAgent).toBe(true);
    expect(initialState("shell").isAgent).toBe(false);
  });
});

describe("reduce — working/waiting/done transitions", () => {
  it("promotes a plain shell when an agent-sourced signal fires", () => {
    const s0 = initialState("shell");
    const s1 = reduce(s0, detected("working", { source: "agent" }));
    expect(s1.isAgent).toBe(true);
    expect(s1.activity).toBe("working");
    expect(s1.workingSince).toBe("2026-01-01T00:00:00.000Z");
  });

  it("flags needsAttention when work stops while not the active terminal", () => {
    const working = reduce(
      initialState("claude"),
      detected("working", { now: "t0" }),
    );
    const stopped = reduce(
      working,
      detected("waiting", { isActiveTerminal: false, now: "t1" }),
    );
    expect(stopped.activity).toBe("waiting");
    expect(stopped.needsAttention).toBe(true);
    expect(stopped.attentionSince).toBe("t1");
  });

  it("lands on done instead of waiting when the user watched it finish", () => {
    const working = reduce(initialState("claude"), detected("working"));
    const stopped = reduce(
      working,
      detected("waiting", { isActiveTerminal: true }),
    );
    expect(stopped.activity).toBe("done");
    expect(stopped.needsAttention).toBe(false);
  });

  it("activating a needsAttention waiting terminal acknowledges it to done", () => {
    const working = reduce(initialState("claude"), detected("working"));
    const waiting = reduce(
      working,
      detected("waiting", { isActiveTerminal: false }),
    );
    const activated = reduce(waiting, { type: "activated" });
    expect(activated.activity).toBe("done");
    expect(activated.needsAttention).toBe(false);
  });

  it("done is sticky against a redundant agent idle re-emission", () => {
    const working = reduce(initialState("claude"), detected("working"));
    const done = reduce(
      working,
      detected("waiting", { isActiveTerminal: true }),
    );
    expect(done.activity).toBe("done");
    const again = reduce(done, detected("waiting"));
    expect(again).toBe(done); // no-op, same reference
  });

  it("blocks shell-source demotion of a born-agent's working phase (subprocess flicker guard)", () => {
    const working = reduce(
      initialState("claude"),
      detected("working", { source: "agent" }),
    );
    const shellNoise = reduce(
      working,
      detected("waiting", { source: "shell" }),
    );
    expect(shellNoise.activity).toBe("working");
  });

  it("blocks timer-source demotion when working was agent-sourced (backgrounded tab guard)", () => {
    const working = reduce(
      initialState("claude"),
      detected("working", { source: "agent" }),
    );
    const timerTick = reduce(working, detected("waiting", { source: "timer" }));
    expect(timerTick.activity).toBe("working");
  });

  it("allows timer-source demotion when working was shell-sourced (pi's idle fallback)", () => {
    const working = reduce(
      initialState("shell"),
      detected("working", { source: "shell" }),
    );
    const timerTick = reduce(working, detected("waiting", { source: "timer" }));
    expect(timerTick.activity).toBe("waiting");
  });

  it("demotes a promoted shell back to non-agent once shell traffic resumes with no pending attention", () => {
    const promoted = reduce(
      initialState("shell"),
      detected("working", { source: "agent" }),
    );
    const backAtPrompt = reduce(
      promoted,
      detected("waiting", { source: "agent", isActiveTerminal: true }),
    );
    const shellPrompt = reduce(
      backAtPrompt,
      detected("waiting", { source: "shell" }),
    );
    expect(shellPrompt.isAgent).toBe(false);
  });

  it("returns the same reference when the event repeats a no-op status", () => {
    const waiting = reduce(
      initialState("shell"),
      detected("waiting", { source: "shell" }),
    );
    const again = reduce(waiting, detected("waiting", { source: "shell" }));
    expect(again).toBe(waiting);
  });
});

describe("stale restore", () => {
  const persistedWorking: Omit<AgentActivityState, "kind" | "stale"> = {
    isAgent: true,
    activity: "working",
    needsAttention: false,
    attentionSince: null,
    workingSince: "t0",
    workingSource: "agent",
    sessionId: null,
    resumeCommand: null,
    agentName: null,
  };

  it("marks a restored working duration stale after a long gap", () => {
    const s = restoreState("claude", persistedWorking, STALE_THRESHOLD_MS + 1);
    expect(s.stale).toBe(true);
  });

  it("does not mark a short gap stale", () => {
    const s = restoreState("claude", persistedWorking, STALE_THRESHOLD_MS - 1);
    expect(s.stale).toBe(false);
  });

  it("a live signal clears a stale flag", () => {
    const stale = restoreState(
      "claude",
      persistedWorking,
      STALE_THRESHOLD_MS + 1,
    );
    const cleared = reduce(stale, detected("working"));
    expect(cleared.stale).toBe(false);
  });

  it("never marks a persisted dead state stale", () => {
    const deadPersisted: Omit<AgentActivityState, "kind" | "stale"> = {
      ...persistedWorking,
      activity: "dead",
    };
    const s = restoreState("claude", deadPersisted, STALE_THRESHOLD_MS + 1);
    expect(s.stale).toBe(false);
  });

  it("falls back to initialState when nothing was persisted", () => {
    const s = restoreState("claude", undefined, 999_999);
    expect(s.activity).toBe("none");
    expect(s.stale).toBe(false);
  });
});

describe("dead / reset", () => {
  it("sets activity to dead and populates resume-identity fields", () => {
    const working = reduce(initialState("claude"), detected("working"));
    const dead = reduce(working, {
      type: "dead",
      sessionId: "abc123",
      resumeCommand: "claude --resume abc123",
      agentName: "Claude Code",
    });
    expect(dead.activity).toBe("dead");
    expect(dead.sessionId).toBe("abc123");
    expect(dead.resumeCommand).toBe("claude --resume abc123");
    expect(dead.needsAttention).toBe(false);
    expect(dead.stale).toBe(false);
  });

  it("dead is terminal — no detected signal reopens it", () => {
    const dead = reduce(initialState("claude"), { type: "dead" });
    const attempted = reduce(dead, detected("working"));
    expect(attempted).toBe(dead);
  });

  it("reset clears a dead state back to fresh", () => {
    const dead = reduce(initialState("claude"), { type: "dead" });
    const reset = reduce(dead, { type: "reset" });
    expect(reset.activity).toBe("none");
    expect(reset.sessionId).toBeNull();
  });

  it("reset is a no-op when not currently dead", () => {
    const s = initialState("claude");
    expect(reduce(s, { type: "reset" })).toBe(s);
  });
});

describe("clearResumeIdentityOnDemotion", () => {
  function withResumeIdentity(s: AgentActivityState): AgentActivityState {
    return {
      ...s,
      sessionId: "abc123",
      resumeCommand: "claude --resume abc123",
      agentName: "Claude Code",
    };
  }

  it("clears resume-identity fields when isAgent demotes true -> false", () => {
    const prev = withResumeIdentity(
      reduce(initialState("shell"), {
        type: "detected",
        status: "working",
        source: "agent",
        isActiveTerminal: false,
        now: "t0",
      }),
    );
    expect(prev.isAgent).toBe(true);

    // isActiveTerminal: true (the user is watching, e.g. they just typed
    // `exit` themselves) -> needsAttention never gets set, so demotion isn't
    // deferred; reduce() demotes isAgent on this same shell/waiting event.
    const demoted = reduce(prev, {
      type: "detected",
      status: "waiting",
      source: "shell",
      isActiveTerminal: true,
      now: "t1",
    });
    expect(demoted.isAgent).toBe(false);

    const cleared = clearResumeIdentityOnDemotion(prev, demoted);
    expect(cleared.sessionId).toBeNull();
    expect(cleared.resumeCommand).toBeNull();
    expect(cleared.agentName).toBeNull();
  });

  it("leaves fields untouched when isAgent stays true", () => {
    const prev = withResumeIdentity(initialState("claude"));
    const next = reduce(prev, {
      type: "detected",
      status: "working",
      source: "agent",
      isActiveTerminal: false,
      now: "t0",
    });
    expect(next.isAgent).toBe(true);
    const result = clearResumeIdentityOnDemotion(prev, next);
    expect(result.sessionId).toBe("abc123");
  });

  it("returns next by reference when there's nothing to clear (no demotion, or already empty)", () => {
    const prev = initialState("shell");
    const next = reduce(prev, {
      type: "detected",
      status: "working",
      source: "shell",
      isActiveTerminal: false,
      now: "t0",
    });
    expect(clearResumeIdentityOnDemotion(prev, next)).toBe(next);
  });
});

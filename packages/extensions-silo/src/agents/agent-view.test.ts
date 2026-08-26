import { describe, it, expect } from "vitest";
import type { AgentInfo } from "@silo-code/sdk";
import {
  deriveStatusRow,
  deriveTab,
  stoppedWorking,
  staleSuffix,
  stripStatusMarker,
} from "./agent-view";

/** Build an AgentInfo with sensible defaults; override just the fields a test
 * cares about. Mirrors the host's shape at `ctx.agents`. */
function agent(over: Partial<AgentInfo> = {}): AgentInfo {
  return {
    terminalId: "t1",
    workspaceId: "w1",
    kind: "claude",
    isAgent: true,
    activity: "none",
    needsAttention: false,
    stale: false,
    ...over,
  };
}

describe("deriveStatusRow", () => {
  it("returns null for non-agent terminals whatever their activity", () => {
    expect(
      deriveStatusRow(agent({ isAgent: false, activity: "working" })),
    ).toBeNull();
    expect(
      deriveStatusRow(agent({ isAgent: false, activity: "idle" })),
    ).toBeNull();
  });

  it("returns null for an agent that has never run", () => {
    expect(deriveStatusRow(agent({ activity: "none" }))).toBeNull();
  });

  it("shows a working row carrying workingSince for elapsed time", () => {
    expect(
      deriveStatusRow(
        agent({ activity: "working", workingSince: "2026-01-01T00:00:00Z" }),
      ),
    ).toEqual({ activity: "working", startedAt: "2026-01-01T00:00:00Z" });
  });

  it("shows a green ready row (with attentionSince) when finished + unseen", () => {
    expect(
      deriveStatusRow(
        agent({
          activity: "idle",
          needsAttention: true,
          attentionSince: "2026-01-01T00:05:00Z",
        }),
      ),
    ).toEqual({ activity: "ready", startedAt: "2026-01-01T00:05:00Z" });
  });

  it("shows a neutral (grey) row once an idle finish is acknowledged", () => {
    expect(
      deriveStatusRow(agent({ activity: "idle", needsAttention: false })),
    ).toEqual({});
  });

  it("shows an error row for an errored agent", () => {
    expect(deriveStatusRow(agent({ activity: "error" }))).toEqual({
      activity: "error",
    });
  });

  it("holds an acknowledged idle row green when forcedAttentionSince is given", () => {
    // "Keep it until the next run" mode: a watched finish the host never
    // flagged still shows green, carrying the local finish timestamp.
    expect(
      deriveStatusRow(
        agent({ activity: "idle", needsAttention: false }),
        "2026-01-01T00:09:00Z",
      ),
    ).toEqual({ activity: "ready", startedAt: "2026-01-01T00:09:00Z" });
  });

  it("prefers the host's attentionSince over a forced timestamp", () => {
    expect(
      deriveStatusRow(
        agent({
          activity: "idle",
          needsAttention: true,
          attentionSince: "2026-01-01T00:05:00Z",
        }),
        "2026-01-01T00:09:00Z",
      ),
    ).toEqual({ activity: "ready", startedAt: "2026-01-01T00:05:00Z" });
  });

  it("does not force non-idle states green", () => {
    expect(
      deriveStatusRow(agent({ activity: "working", workingSince: "x" }), "y"),
    ).toEqual({
      activity: "working",
      startedAt: "x",
    });
    expect(deriveStatusRow(agent({ isAgent: false }), "y")).toBeNull();
    expect(deriveStatusRow(agent({ activity: "none" }), "y")).toBeNull();
  });

  it("shows a warn row for a dead (backend-gone) agent", () => {
    expect(deriveStatusRow(agent({ activity: "dead" }))).toEqual({
      activity: "warn",
    });
  });
});

describe("deriveTab", () => {
  it("returns null for non-agents and never-ran agents", () => {
    expect(
      deriveTab(agent({ isAgent: false, activity: "working" })),
    ).toBeNull();
    expect(deriveTab(agent({ activity: "none" }))).toBeNull();
  });

  it("badges a working agent with a spinner", () => {
    expect(deriveTab(agent({ activity: "working" }))).toEqual({
      activity: "working",
      tooltip: "Agent working",
    });
  });

  it("badges a finished-unseen agent as ready/Finished", () => {
    expect(
      deriveTab(agent({ activity: "idle", needsAttention: true })),
    ).toEqual({
      activity: "ready",
      tooltip: "Finished",
    });
  });

  it("drops the badge once the finish is acknowledged", () => {
    expect(
      deriveTab(agent({ activity: "idle", needsAttention: false })),
    ).toBeNull();
  });

  it("holds the Finished badge when forceAttention is set (kept-until-next-run mode)", () => {
    expect(
      deriveTab(agent({ activity: "idle", needsAttention: false }), true),
    ).toEqual({
      activity: "ready",
      tooltip: "Finished",
    });
  });

  it("forceAttention does not conjure a badge for non-idle states", () => {
    expect(deriveTab(agent({ activity: "none" }), true)).toBeNull();
    expect(
      deriveTab(agent({ isAgent: false, activity: "idle" }), true),
    ).toBeNull();
  });

  it("badges an errored agent", () => {
    expect(deriveTab(agent({ activity: "error" }))).toEqual({
      activity: "error",
      tooltip: "Agent error",
    });
  });

  it("surfaces the resume command in a dead agent's tooltip when one is known", () => {
    expect(
      deriveTab(
        agent({ activity: "dead", resumeCommand: "claude --resume 01abc" }),
      ),
    ).toEqual({
      activity: "warn",
      tooltip: "Agent session ended — claude --resume 01abc",
    });
  });

  it("falls back to a session-id-less dead tooltip", () => {
    expect(deriveTab(agent({ activity: "dead" }))).toEqual({
      activity: "warn",
      tooltip: "Agent session ended",
    });
  });

  it("appends the stale suffix to live-state tooltips", () => {
    expect(
      deriveTab(agent({ activity: "working", stale: true }))?.tooltip,
    ).toBe("Agent working (unconfirmed since restart)");
    expect(
      deriveTab(agent({ activity: "idle", needsAttention: true, stale: true }))
        ?.tooltip,
    ).toBe("Finished (unconfirmed since restart)");
  });
});

describe("stoppedWorking", () => {
  it("is true on a working → idle transition for an agent", () => {
    expect(
      stoppedWorking(
        agent({ activity: "working" }),
        agent({ activity: "idle" }),
      ),
    ).toBe(true);
  });

  it("never fires on the first snapshot (undefined prev)", () => {
    expect(stoppedWorking(undefined, agent({ activity: "idle" }))).toBe(false);
  });

  it("does not fire on idle → idle (e.g. acknowledgement) or repeated frames", () => {
    expect(
      stoppedWorking(agent({ activity: "idle" }), agent({ activity: "idle" })),
    ).toBe(false);
    expect(
      stoppedWorking(
        agent({ activity: "working" }),
        agent({ activity: "working" }),
      ),
    ).toBe(false);
  });

  it("does not fire on working → error or working → dead (clean-finish only)", () => {
    expect(
      stoppedWorking(
        agent({ activity: "working" }),
        agent({ activity: "error" }),
      ),
    ).toBe(false);
    expect(
      stoppedWorking(
        agent({ activity: "working" }),
        agent({ activity: "dead" }),
      ),
    ).toBe(false);
  });

  it("does not fire when the terminal isn't an agent", () => {
    expect(
      stoppedWorking(
        agent({ activity: "working" }),
        agent({ activity: "idle", isAgent: false }),
      ),
    ).toBe(false);
  });
});

describe("staleSuffix", () => {
  it("is empty when not stale", () => {
    expect(staleSuffix(false, "label")).toBe("");
    expect(staleSuffix(false, "tooltip")).toBe("");
  });

  it("uses terse wording for labels and a fuller one for tooltips", () => {
    expect(staleSuffix(true, "label")).toBe(" (unconfirmed)");
    expect(staleSuffix(true, "tooltip")).toBe(" (unconfirmed since restart)");
  });
});

describe("stripStatusMarker", () => {
  it("strips a leading Claude/Codex braille spinner glyph", () => {
    expect(stripStatusMarker("⠋ my-project")).toBe("my-project");
  });

  it("strips Claude's ✳ idle marker", () => {
    expect(stripStatusMarker("✳ my-project")).toBe("my-project");
  });

  it("strips Codex's [ ! ] / [ . ] action markers", () => {
    expect(stripStatusMarker("[ ! ] my-project")).toBe("my-project");
    expect(stripStatusMarker("[ . ] my-project")).toBe("my-project");
  });

  it("strips a trailing Cursor Agent status suffix", () => {
    expect(stripStatusMarker("my-chat - ⏳ Working on it")).toBe("my-chat");
    expect(stripStatusMarker("my-chat - ✅ Ready")).toBe("my-chat");
    expect(stripStatusMarker("my-chat - Waiting for you (2 items)")).toBe(
      "my-chat",
    );
  });

  it("leaves an unmarked title untouched", () => {
    expect(stripStatusMarker("plain-title")).toBe("plain-title");
  });
});

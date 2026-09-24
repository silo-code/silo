import { describe, it, expect } from "vitest";
import type { AgentInfo } from "@silo-code/sdk";
import type { UpdatePhase } from "@silo-code/extension-host/internal";
import {
  updateLinkLabel,
  isUpdateActionable,
  buildUpdateLead,
  isVersionSkipped,
  describeCheckOutcome,
  countRunningChatAgents,
} from "./model";

/** Build an AgentInfo with sensible defaults; override just the fields a test
 * cares about. Mirrors the host's shape at `ctx.agents`. */
function agent(over: Partial<AgentInfo> = {}): AgentInfo {
  return {
    title: "claude",
    id: over.terminalId ?? "t1",
    workspaceId: "w1",
    kind: "chat",
    isAgent: true,
    activity: "none",
    needsAttention: false,
    stale: false,
    canResume: false,
    ...over,
  };
}

// `isVersionSkipped` takes its comparator as a parameter precisely so this
// test doesn't need to pull in the real `compareVersions` (which lives on
// the privileged internal barrel, a real-value import that would drag the
// whole barrel — Monaco included — into this pure-logic unit test). A tiny
// numeric-aware stub is all the branching logic under test needs.
function compareVersions(a: string, b: string): number {
  const [pa, pb] = [a.split(".").map(Number), b.split(".").map(Number)];
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

describe("updateLinkLabel", () => {
  it("shows the actionable link when an update is available", () => {
    expect(updateLinkLabel("available")).toBe("Update Silo");
    expect(isUpdateActionable("available")).toBe(true);
  });

  it("shows a disabled 'Installing…' label while installing", () => {
    expect(updateLinkLabel("installing")).toBe("Installing…");
    expect(isUpdateActionable("installing")).toBe(false);
  });

  it("renders nothing (and is not actionable) for every other phase", () => {
    const hidden: UpdatePhase[] = ["idle", "checking", "upToDate", "error"];
    for (const phase of hidden) {
      expect(updateLinkLabel(phase)).toBeNull();
      expect(isUpdateActionable(phase)).toBe(false);
    }
  });
});

describe("buildUpdateLead", () => {
  it("names the version when known", () => {
    expect(buildUpdateLead("1.2.3")).toBe("Silo 1.2.3 is ready to install.");
  });

  it("falls back to a generic phrase when the version is unknown", () => {
    expect(buildUpdateLead(null)).toBe(
      "A new version of Silo is ready to install.",
    );
  });
});

describe("isVersionSkipped", () => {
  it("is false when nothing has been skipped", () => {
    expect(isVersionSkipped("1.2.0", null, compareVersions)).toBe(false);
  });

  it("is true when the available version matches the skipped one", () => {
    expect(isVersionSkipped("1.2.0", "1.2.0", compareVersions)).toBe(true);
  });

  it("is true when the skipped version is newer (shouldn't happen, but stays suppressed)", () => {
    expect(isVersionSkipped("1.2.0", "1.3.0", compareVersions)).toBe(true);
  });

  it("is false once a newer version than the skipped one is available", () => {
    expect(isVersionSkipped("1.3.0", "1.2.0", compareVersions)).toBe(false);
  });

  it("is false when there's no available version", () => {
    expect(isVersionSkipped(null, "1.2.0", compareVersions)).toBe(false);
  });
});

describe("countRunningChatAgents", () => {
  it("is 0 when there are no agents", () => {
    expect(countRunningChatAgents([])).toBe(0);
  });

  it("counts only chat agents with activity 'working'", () => {
    const agents = [
      agent({ id: "a", kind: "chat", activity: "working" }),
      agent({ id: "b", kind: "chat", activity: "idle" }),
      agent({ id: "c", kind: "terminal", activity: "working" }),
      agent({ id: "d", kind: "chat", activity: "working" }),
    ];
    expect(countRunningChatAgents(agents)).toBe(2);
  });
});

describe("describeCheckOutcome", () => {
  it("opens the modal when an update is available", () => {
    expect(describeCheckOutcome("available")).toEqual({ kind: "prompt" });
  });

  it("toasts 'up to date'", () => {
    expect(describeCheckOutcome("upToDate")).toEqual({
      kind: "toast",
      level: "info",
      message: "You're on the latest version.",
    });
  });

  it("toasts an error", () => {
    expect(describeCheckOutcome("error")).toEqual({
      kind: "toast",
      level: "error",
      message: "Couldn't check for updates.",
    });
  });

  it("does nothing for transient phases", () => {
    const transient: UpdatePhase[] = ["idle", "checking", "installing"];
    for (const phase of transient) {
      expect(describeCheckOutcome(phase)).toEqual({ kind: "none" });
    }
  });
});

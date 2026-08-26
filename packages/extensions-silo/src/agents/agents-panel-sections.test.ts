import { describe, expect, it } from "vitest";
import type { AgentRow } from "./agents-panel-view";
import {
  buildAgeSections,
  buildStatusSections,
  staleSectionStartsExpanded,
} from "./agents-panel";

function row(over: Partial<AgentRow> = {}): AgentRow {
  return {
    terminalId: "t1",
    workspaceId: "w1",
    section: "working",
    title: "agent",
    workspaceName: "ws",
    activity: "working",
    ...over,
  };
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

describe("buildStatusSections (staleDoneEnabled: true)", () => {
  it("always returns the ready/working/done/N+ hours old headings, even with no agents at all", () => {
    const sections = buildStatusSections([], true, 8);
    expect(sections.map((s) => s.header)).toEqual([
      "Ready",
      "Working",
      "Idle",
      "8+ hours old",
    ]);
    expect(sections.every((s) => s.rows.length === 0)).toBe(true);
  });

  it("only marks the 'N+ hours old' heading as collapsible", () => {
    const sections = buildStatusSections([], true, 8);
    expect(sections.find((s) => s.header === "8+ hours old")?.collapsible).toBe(
      true,
    );
    expect(
      sections
        .filter((s) => s.header !== "8+ hours old")
        .every((s) => !s.collapsible),
    ).toBe(true);
  });

  it("keeps sections with no matching agents empty rather than dropping them", () => {
    const sections = buildStatusSections(
      [row({ terminalId: "t1", section: "working", activity: "working" })],
      true,
      8,
    );
    expect(sections.find((s) => s.header === "Ready")?.rows).toEqual([]);
    expect(
      sections
        .find((s) => s.header === "Working")
        ?.rows.map((r) => r.terminalId),
    ).toEqual(["t1"]);
    expect(sections.find((s) => s.header === "Idle")?.rows).toEqual([]);
    expect(sections.find((s) => s.header === "8+ hours old")?.rows).toEqual([]);
  });

  it("splits done rows older than the configured threshold into their own heading", () => {
    const sections = buildStatusSections(
      [
        row({
          terminalId: "recent",
          section: "done",
          activity: "idle",
          since: hoursAgo(1),
        }),
        row({
          terminalId: "stale",
          section: "done",
          activity: "idle",
          since: hoursAgo(9),
        }),
      ],
      true,
      8,
    );
    expect(
      sections.find((s) => s.header === "Idle")?.rows.map((r) => r.terminalId),
    ).toEqual(["recent"]);
    expect(
      sections
        .find((s) => s.header === "8+ hours old")
        ?.rows.map((r) => r.terminalId),
    ).toEqual(["stale"]);
  });

  it("treats a done row exactly at the threshold as stale", () => {
    const sections = buildStatusSections(
      [
        row({
          terminalId: "boundary",
          section: "done",
          activity: "idle",
          since: hoursAgo(8),
        }),
      ],
      true,
      8,
    );
    expect(sections.find((s) => s.header === "Idle")?.rows).toEqual([]);
    expect(
      sections
        .find((s) => s.header === "8+ hours old")
        ?.rows.map((r) => r.terminalId),
    ).toEqual(["boundary"]);
  });

  it("keeps a done row with no since timestamp in Done, not N+ hours old", () => {
    const sections = buildStatusSections(
      [
        row({
          terminalId: "no-since",
          section: "done",
          activity: "idle",
          since: undefined,
        }),
      ],
      true,
      8,
    );
    expect(
      sections.find((s) => s.header === "Idle")?.rows.map((r) => r.terminalId),
    ).toEqual(["no-since"]);
    expect(sections.find((s) => s.header === "8+ hours old")?.rows).toEqual([]);
  });

  it("uses the configured threshold, not a hardcoded 8 hours", () => {
    const sections = buildStatusSections(
      [
        row({
          terminalId: "t1",
          section: "done",
          activity: "idle",
          since: hoursAgo(5),
        }),
      ],
      true,
      4,
    );
    expect(sections.map((s) => s.header)).toContain("4+ hours old");
    expect(sections.find((s) => s.header === "Idle")?.rows).toEqual([]);
    expect(
      sections
        .find((s) => s.header === "4+ hours old")
        ?.rows.map((r) => r.terminalId),
    ).toEqual(["t1"]);
  });
});

describe("buildStatusSections (staleDoneEnabled: false)", () => {
  it("omits the 'N+ hours old' heading entirely", () => {
    const sections = buildStatusSections([], false, 8);
    expect(sections.map((s) => s.header)).toEqual(["Ready", "Working", "Idle"]);
  });

  it("keeps old done rows in Done instead of splitting them out", () => {
    const sections = buildStatusSections(
      [
        row({
          terminalId: "recent",
          section: "done",
          activity: "idle",
          since: hoursAgo(1),
        }),
        row({
          terminalId: "stale",
          section: "done",
          activity: "idle",
          since: hoursAgo(9),
        }),
      ],
      false,
      8,
    );
    expect(
      sections
        .find((s) => s.header === "Idle")
        ?.rows.map((r) => r.terminalId)
        .sort(),
    ).toEqual(["recent", "stale"]);
  });
});

describe("buildAgeSections (staleDoneEnabled: true)", () => {
  it("returns one unheaded flat section plus the 'N+ hours old' heading, even with no agents at all", () => {
    const sections = buildAgeSections([], true, 8, []);
    expect(sections.map((s) => s.header)).toEqual(["", "8+ hours old"]);
    expect(sections.every((s) => s.rows.length === 0)).toBe(true);
  });

  it("only marks the 'N+ hours old' heading as collapsible", () => {
    const sections = buildAgeSections([], true, 8, []);
    expect(sections.find((s) => s.header === "8+ hours old")?.collapsible).toBe(
      true,
    );
    expect(sections.find((s) => s.header === "")?.collapsible).toBeUndefined();
  });

  it("mixes ready, working and recent done rows into one list, ordered by since (most recent first), not by status", () => {
    const sections = buildAgeSections(
      [
        row({
          terminalId: "oldest",
          section: "done",
          activity: "idle",
          since: hoursAgo(3),
        }),
        row({
          terminalId: "newest",
          section: "ready",
          activity: "idle",
          since: hoursAgo(1),
        }),
        row({
          terminalId: "middle",
          section: "working",
          activity: "working",
          since: hoursAgo(2),
        }),
      ],
      true,
      8,
      [],
    );
    expect(
      sections.find((s) => s.header === "")?.rows.map((r) => r.terminalId),
    ).toEqual(["newest", "middle", "oldest"]);
  });

  it("splits only done rows older than the configured threshold into their own heading", () => {
    const sections = buildAgeSections(
      [
        row({
          terminalId: "recent-done",
          section: "done",
          activity: "idle",
          since: hoursAgo(1),
        }),
        row({
          terminalId: "stale-done",
          section: "done",
          activity: "idle",
          since: hoursAgo(9),
        }),
        row({
          terminalId: "long-working",
          section: "working",
          activity: "working",
          since: hoursAgo(9),
        }),
      ],
      true,
      8,
      [],
    );
    expect(
      sections.find((s) => s.header === "")?.rows.map((r) => r.terminalId),
    ).toEqual(["recent-done", "long-working"]);
    expect(
      sections
        .find((s) => s.header === "8+ hours old")
        ?.rows.map((r) => r.terminalId),
    ).toEqual(["stale-done"]);
  });

  it("puts undragged rows above dragged ones, and honors manualOrder's relative order for the dragged ones", () => {
    const sections = buildAgeSections(
      [
        row({ terminalId: "a", since: hoursAgo(1) }),
        row({ terminalId: "b", since: hoursAgo(2) }),
        row({ terminalId: "c", since: hoursAgo(3) }),
      ],
      true,
      8,
      ["c", "a"], // dragged, in this order — "b" was never touched
    );
    expect(
      sections.find((s) => s.header === "")?.rows.map((r) => r.terminalId),
    ).toEqual([
      "b", // undragged, floats to the top
      "c", // dragged, first in manualOrder
      "a", // dragged, second in manualOrder
    ]);
  });

  it("ignores manualOrder ids with no matching row instead of erroring", () => {
    const sections = buildAgeSections(
      [row({ terminalId: "a", since: hoursAgo(1) })],
      true,
      8,
      ["closed-terminal", "a"],
    );
    expect(
      sections.find((s) => s.header === "")?.rows.map((r) => r.terminalId),
    ).toEqual(["a"]);
  });
});

describe("buildAgeSections (staleDoneEnabled: false)", () => {
  it("omits the 'N+ hours old' heading entirely", () => {
    const sections = buildAgeSections([], false, 8, []);
    expect(sections.map((s) => s.header)).toEqual([""]);
  });

  it("keeps old done rows in the flat list instead of splitting them out", () => {
    const sections = buildAgeSections(
      [
        row({
          terminalId: "recent",
          section: "done",
          activity: "idle",
          since: hoursAgo(1),
        }),
        row({
          terminalId: "stale",
          section: "done",
          activity: "idle",
          since: hoursAgo(9),
        }),
      ],
      false,
      8,
      [],
    );
    expect(
      sections.find((s) => s.header === "")?.rows.map((r) => r.terminalId),
    ).toEqual(["recent", "stale"]);
  });
});

describe("staleSectionStartsExpanded", () => {
  it("opens the old heading when nothing is ready, working or idle", () => {
    const sections = buildStatusSections(
      [row({ section: "done", since: hoursAgo(9) })],
      true,
      8,
    );
    expect(staleSectionStartsExpanded(sections)).toBe(true);
  });

  it("stays collapsed while any other heading has rows", () => {
    const sections = buildStatusSections(
      [
        row({ section: "working" }),
        row({ terminalId: "t2", section: "done", since: hoursAgo(9) }),
      ],
      true,
      8,
    );
    expect(staleSectionStartsExpanded(sections)).toBe(false);
  });

  it("is true when the view is completely empty", () => {
    // Nothing to reveal either way, but the rule shouldn't special-case it.
    expect(staleSectionStartsExpanded(buildStatusSections([], true, 8))).toBe(
      true,
    );
  });

  it("ignores the old heading's own rows when deciding", () => {
    // Two stale rows and nothing else still counts as "everything else empty".
    const sections = buildStatusSections(
      [
        row({ section: "done", since: hoursAgo(9) }),
        row({ terminalId: "t2", section: "done", since: hoursAgo(20) }),
      ],
      true,
      8,
    );
    expect(staleSectionStartsExpanded(sections)).toBe(true);
  });
});

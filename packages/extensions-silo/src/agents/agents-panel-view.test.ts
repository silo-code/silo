import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { AgentInfo, Workspace } from "@silo-code/sdk";
import {
  buildAgentRows,
  groupAgentRows,
  groupAgentRowsByWorkspace,
  formatElapsed,
  isAtLeastHoursOld,
  moveItem,
  orderAgeRows,
  reconcileAgeManualOrder,
  updateDoneSince,
  type AgentRow,
} from "./agents-panel-view";

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

function workspace(over: Partial<Workspace> = {}): Workspace {
  return {
    id: "w1",
    name: "my-project",
    folder: "/tmp/my-project",
    createdAt: "2026-01-01T00:00:00Z",
    lastOpenedAt: "2026-01-01T00:00:00Z",
    terminals: [{ id: "t1", sessionId: "s1", kind: "claude", title: "claude" }],
    editors: [],
    ...over,
  };
}

describe("buildAgentRows", () => {
  it("drops non-agent terminals and agents that have never run", () => {
    expect(buildAgentRows([agent({ isAgent: false })], [workspace()])).toEqual(
      [],
    );
    expect(
      buildAgentRows([agent({ activity: "none" })], [workspace()]),
    ).toEqual([]);
  });

  it("sections a needs-attention agent as ready regardless of activity", () => {
    const rows = buildAgentRows(
      [
        agent({
          activity: "idle",
          needsAttention: true,
          attentionSince: "2026-01-01T00:05:00Z",
        }),
      ],
      [workspace()],
    );
    expect(rows).toEqual([
      {
        terminalId: "t1",
        workspaceId: "w1",
        section: "ready",
        title: "claude",
        workspaceName: "my-project",
        activity: "idle",
        since: "2026-01-01T00:05:00Z",
      },
    ]);
  });

  it("sections a working agent as working, carrying workingSince", () => {
    const rows = buildAgentRows(
      [agent({ activity: "working", workingSince: "2026-01-01T00:00:00Z" })],
      [workspace()],
    );
    expect(rows[0]).toMatchObject({
      section: "working",
      since: "2026-01-01T00:00:00Z",
    });
  });

  it("sections an acknowledged idle agent as done with no since", () => {
    const rows = buildAgentRows(
      [agent({ activity: "idle", needsAttention: false })],
      [workspace()],
    );
    expect(rows[0]).toMatchObject({ section: "done", since: undefined });
  });

  it("sections error and dead agents as done", () => {
    expect(
      buildAgentRows([agent({ activity: "error" })], [workspace()])[0],
    ).toMatchObject({
      section: "done",
    });
    expect(
      buildAgentRows([agent({ activity: "dead" })], [workspace()])[0],
    ).toMatchObject({
      section: "done",
    });
  });

  it("passes agentId through for the icon column, undefined when unresolved", () => {
    expect(
      buildAgentRows(
        [agent({ activity: "working", agentId: "claude" })],
        [workspace()],
      )[0].agentId,
    ).toBe("claude");
    expect(
      buildAgentRows([agent({ activity: "working" })], [workspace()])[0]
        .agentId,
    ).toBeUndefined();
  });

  it("prefers customName over the OSC title, and strips status markers from the OSC title", () => {
    const ws = workspace({
      terminals: [
        { id: "t1", sessionId: "s1", kind: "claude", title: "⠋ raw-title" },
      ],
    });
    expect(
      buildAgentRows([agent({ activity: "working" })], [ws])[0].title,
    ).toBe("raw-title");

    const wsNamed = workspace({
      terminals: [
        {
          id: "t1",
          sessionId: "s1",
          kind: "claude",
          title: "⠋ raw-title",
          customName: "My Agent",
        },
      ],
    });
    expect(
      buildAgentRows([agent({ activity: "working" })], [wsNamed])[0].title,
    ).toBe("My Agent");
  });

  it("drops rows whose workspace or terminal can no longer be found", () => {
    expect(
      buildAgentRows(
        [agent({ activity: "working", workspaceId: "missing" })],
        [workspace()],
      ),
    ).toEqual([]);
    expect(
      buildAgentRows(
        [agent({ activity: "working", terminalId: "missing" })],
        [workspace()],
      ),
    ).toEqual([]);
  });
});

describe("groupAgentRows", () => {
  it("buckets rows into ready/working/done", () => {
    const rows = buildAgentRows(
      [
        agent({
          terminalId: "t1",
          activity: "idle",
          needsAttention: true,
          attentionSince: "x",
        }),
        agent({ terminalId: "t2", activity: "working", workingSince: "y" }),
        agent({ terminalId: "t3", activity: "idle" }),
      ],
      [
        workspace({
          terminals: [
            { id: "t1", sessionId: "s1", kind: "claude", title: "a" },
            { id: "t2", sessionId: "s2", kind: "claude", title: "b" },
            { id: "t3", sessionId: "s3", kind: "claude", title: "c" },
          ],
        }),
      ],
    );
    const groups = groupAgentRows(rows);
    expect(groups.ready.map((r) => r.terminalId)).toEqual(["t1"]);
    expect(groups.working.map((r) => r.terminalId)).toEqual(["t2"]);
    expect(groups.done.map((r) => r.terminalId)).toEqual(["t3"]);
  });

  it("sorts rows with a since timestamp most-recent-first", () => {
    const rows = buildAgentRows(
      [
        agent({
          terminalId: "t1",
          activity: "idle",
          needsAttention: true,
          attentionSince: "2026-01-01T00:00:00Z",
        }),
        agent({
          terminalId: "t2",
          activity: "idle",
          needsAttention: true,
          attentionSince: "2026-01-01T00:10:00Z",
        }),
      ],
      [
        workspace({
          terminals: [
            { id: "t1", sessionId: "s1", kind: "claude", title: "a" },
            { id: "t2", sessionId: "s2", kind: "claude", title: "b" },
          ],
        }),
      ],
    );
    expect(groupAgentRows(rows).ready.map((r) => r.terminalId)).toEqual([
      "t2",
      "t1",
    ]);
  });

  it("sorts done rows (no since) alphabetically by title", () => {
    const rows = buildAgentRows(
      [
        agent({ terminalId: "t1", activity: "idle" }),
        agent({ terminalId: "t2", activity: "idle" }),
      ],
      [
        workspace({
          terminals: [
            { id: "t1", sessionId: "s1", kind: "claude", title: "zebra" },
            { id: "t2", sessionId: "s2", kind: "claude", title: "apple" },
          ],
        }),
      ],
    );
    expect(groupAgentRows(rows).done.map((r) => r.title)).toEqual([
      "apple",
      "zebra",
    ]);
  });
});

describe("groupAgentRowsByWorkspace", () => {
  const wsA = workspace({
    id: "wA",
    name: "beta-project",
    terminals: [
      { id: "t1", sessionId: "s1", kind: "claude", title: "a" },
      { id: "t2", sessionId: "s2", kind: "claude", title: "b" },
    ],
  });
  const wsB = workspace({
    id: "wB",
    name: "alpha-project",
    terminals: [{ id: "t3", sessionId: "s3", kind: "claude", title: "c" }],
  });

  it("buckets rows by workspace and sorts workspace groups alphabetically by name", () => {
    const rows = buildAgentRows(
      [
        agent({ terminalId: "t1", workspaceId: "wA", activity: "working" }),
        agent({ terminalId: "t3", workspaceId: "wB", activity: "working" }),
      ],
      [wsA, wsB],
    );
    const groups = groupAgentRowsByWorkspace(rows);
    expect(groups.map((g) => g.workspaceName)).toEqual([
      "alpha-project",
      "beta-project",
    ]);
    expect(groups.map((g) => g.rows.map((r) => r.terminalId))).toEqual([
      ["t3"],
      ["t1"],
    ]);
  });

  it("orders rows within a workspace ready-before-working-before-done", () => {
    const rows = buildAgentRows(
      [
        agent({ terminalId: "t1", workspaceId: "wA", activity: "idle" }),
        agent({
          terminalId: "t2",
          workspaceId: "wA",
          activity: "idle",
          needsAttention: true,
          attentionSince: "x",
        }),
      ],
      [wsA],
    );
    const groups = groupAgentRowsByWorkspace(rows);
    expect(groups[0].rows.map((r) => r.terminalId)).toEqual(["t2", "t1"]);
  });

  it("omits workspaces with no agent rows", () => {
    const rows = buildAgentRows(
      [agent({ terminalId: "t1", workspaceId: "wA", activity: "working" })],
      [wsA, wsB],
    );
    expect(groupAgentRowsByWorkspace(rows).map((g) => g.workspaceId)).toEqual([
      "wA",
    ]);
  });
});

describe("formatElapsed", () => {
  const now = new Date("2026-01-01T00:10:00Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows whole seconds under a minute", () => {
    expect(formatElapsed(new Date(now.getTime() - 45_000).toISOString())).toBe(
      "45s",
    );
  });

  it("shows whole minutes under an hour", () => {
    expect(
      formatElapsed(new Date(now.getTime() - 12 * 60_000).toISOString()),
    ).toBe("12m");
  });

  it("shows whole hours under a day", () => {
    expect(
      formatElapsed(new Date(now.getTime() - 3 * 3_600_000).toISOString()),
    ).toBe("3h");
  });

  it("shows whole days beyond that", () => {
    expect(
      formatElapsed(new Date(now.getTime() - 2 * 86_400_000).toISOString()),
    ).toBe("2d");
  });

  it("clamps a future timestamp (clock skew) to 0s rather than negative", () => {
    expect(formatElapsed(new Date(now.getTime() + 5_000).toISOString())).toBe(
      "0s",
    );
  });
});

describe("isAtLeastHoursOld", () => {
  const now = new Date("2026-01-01T00:00:00Z");

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is false for a timestamp under the threshold", () => {
    expect(
      isAtLeastHoursOld(
        new Date(now.getTime() - 7 * 3_600_000).toISOString(),
        8,
      ),
    ).toBe(false);
  });

  it("is true at exactly the threshold", () => {
    expect(
      isAtLeastHoursOld(
        new Date(now.getTime() - 8 * 3_600_000).toISOString(),
        8,
      ),
    ).toBe(true);
  });

  it("is true past the threshold", () => {
    expect(
      isAtLeastHoursOld(
        new Date(now.getTime() - 9 * 3_600_000).toISOString(),
        8,
      ),
    ).toBe(true);
  });
});

describe("updateDoneSince", () => {
  it("stamps a newly-done terminal with the given now", () => {
    const next = updateDoneSince(
      new Map(),
      [agent({ activity: "idle" })],
      "t0",
    );
    expect(next.get("t1")).toBe("t0");
  });

  it("keeps the original timestamp while a terminal stays done across calls", () => {
    const first = updateDoneSince(
      new Map(),
      [agent({ activity: "idle" })],
      "t0",
    );
    const second = updateDoneSince(first, [agent({ activity: "idle" })], "t1");
    expect(second.get("t1")).toBe("t0");
  });

  it("does not track terminals outside the done section", () => {
    const next = updateDoneSince(
      new Map(),
      [agent({ activity: "working" })],
      "t0",
    );
    expect(next.has("t1")).toBe(false);
    expect(
      updateDoneSince(
        new Map(),
        [
          agent({
            activity: "idle",
            needsAttention: true,
            attentionSince: "x",
          }),
        ],
        "t0",
      ).has("t1"),
    ).toBe(false);
  });

  it("drops a terminal once it's no longer in the snapshot (closed)", () => {
    const first = updateDoneSince(
      new Map(),
      [agent({ activity: "idle" })],
      "t0",
    );
    const second = updateDoneSince(first, [], "t1");
    expect(second.has("t1")).toBe(false);
  });

  it("re-stamps a terminal that leaves done and later returns to it", () => {
    const done = updateDoneSince(
      new Map(),
      [agent({ activity: "idle" })],
      "t0",
    );
    const working = updateDoneSince(
      done,
      [agent({ activity: "working" })],
      "t1",
    );
    expect(working.has("t1")).toBe(false); // gone while working — not "done"
    const doneAgain = updateDoneSince(
      working,
      [agent({ activity: "idle" })],
      "t2",
    );
    expect(doneAgain.get("t1")).toBe("t2"); // fresh stamp, not the original t0
  });
});

describe("buildAgentRows + groupAgentRows with a doneSince map", () => {
  it("gives done rows a since, sorted shortest-duration-first like the other sections", () => {
    const ws = workspace({
      terminals: [
        { id: "t1", sessionId: "s1", kind: "claude", title: "a" },
        { id: "t2", sessionId: "s2", kind: "claude", title: "b" },
      ],
    });
    const doneSince = new Map([
      ["t1", "2026-01-01T00:00:00Z"], // done longer ago
      ["t2", "2026-01-01T00:05:00Z"], // done more recently — shorter duration
    ]);
    const rows = buildAgentRows(
      [
        agent({ terminalId: "t1", activity: "idle" }),
        agent({ terminalId: "t2", activity: "idle" }),
      ],
      [ws],
      doneSince,
    );
    expect(rows.map((r) => r.since)).toEqual([
      "2026-01-01T00:00:00Z",
      "2026-01-01T00:05:00Z",
    ]);
    expect(groupAgentRows(rows).done.map((r) => r.terminalId)).toEqual([
      "t2",
      "t1",
    ]);
  });
});

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

describe("moveItem", () => {
  it("moves an item forward", () => {
    expect(moveItem(["a", "b", "c", "d"], 0, 2)).toEqual(["b", "c", "a", "d"]);
  });

  it("moves an item backward", () => {
    expect(moveItem(["a", "b", "c", "d"], 3, 1)).toEqual(["a", "d", "b", "c"]);
  });

  it("is a no-op when from equals to", () => {
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });

  it("clamps an out-of-range from into bounds", () => {
    expect(moveItem(["a", "b", "c"], 99, 0)).toEqual(["c", "a", "b"]);
  });

  it("clamps an out-of-range to into bounds", () => {
    expect(moveItem(["a", "b", "c"], 0, 99)).toEqual(["b", "c", "a"]);
  });

  it("returns an empty array unchanged", () => {
    expect(moveItem([], 0, 0)).toEqual([]);
  });

  it("doesn't mutate the input array", () => {
    const input = ["a", "b", "c"];
    moveItem(input, 0, 2);
    expect(input).toEqual(["a", "b", "c"]);
  });
});

describe("reconcileAgeManualOrder", () => {
  it("prepends newcomers and keeps known relative order", () => {
    expect(reconcileAgeManualOrder(["b", "a"], ["c", "a", "b"])).toEqual([
      "c",
      "b",
      "a",
    ]);
  });

  it("drops ids that left the visible set", () => {
    expect(reconcileAgeManualOrder(["gone", "a", "b"], ["b", "a"])).toEqual([
      "a",
      "b",
    ]);
  });

  it("seeds an empty order from the visible id list as-is", () => {
    expect(reconcileAgeManualOrder([], ["a", "b", "c"])).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  it("preserves multiple newcomers in the order they appear", () => {
    expect(reconcileAgeManualOrder(["z"], ["n1", "n2", "z"])).toEqual([
      "n1",
      "n2",
      "z",
    ]);
  });
});

describe("orderAgeRows", () => {
  it("with an empty manualOrder, keeps row encounter order (no since-sort)", () => {
    const rows = [
      row({ terminalId: "oldest", since: hoursAgo(3) }),
      row({ terminalId: "newest", since: hoursAgo(1) }),
      row({ terminalId: "middle", since: hoursAgo(2) }),
    ];
    expect(orderAgeRows(rows, []).map((r) => r.terminalId)).toEqual([
      "oldest",
      "newest",
      "middle",
    ]);
  });

  it("prepends every unknown id above the manualOrder sequence", () => {
    const rows = [
      row({ terminalId: "known-1", since: hoursAgo(1) }),
      row({ terminalId: "new", since: hoursAgo(9) }),
      row({ terminalId: "known-2", since: hoursAgo(2) }),
    ];
    expect(
      orderAgeRows(rows, ["known-1", "known-2"]).map((r) => r.terminalId),
    ).toEqual(["new", "known-1", "known-2"]);
  });

  it("orders known rows by their position in manualOrder, not by since", () => {
    const rows = [
      row({ terminalId: "a", since: hoursAgo(1) }),
      row({ terminalId: "b", since: hoursAgo(9) }),
    ];
    // "b" is older but listed first in manualOrder — manualOrder wins.
    expect(orderAgeRows(rows, ["b", "a"]).map((r) => r.terminalId)).toEqual([
      "b",
      "a",
    ]);
  });

  it("does not reshuffle when a known row's since becomes more recent", () => {
    const rows = [
      row({ terminalId: "a", since: hoursAgo(9) }),
      row({ terminalId: "b", since: hoursAgo(1) }),
    ];
    expect(orderAgeRows(rows, ["a", "b"]).map((r) => r.terminalId)).toEqual([
      "a",
      "b",
    ]);
  });

  it("silently ignores a manualOrder id with no matching row", () => {
    const rows = [row({ terminalId: "a", since: hoursAgo(1) })];
    expect(orderAgeRows(rows, ["gone", "a"]).map((r) => r.terminalId)).toEqual([
      "a",
    ]);
  });
});

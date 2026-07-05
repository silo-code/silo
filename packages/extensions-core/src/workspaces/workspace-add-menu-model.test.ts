import { describe, it, expect } from "vitest";
import { partitionSavedEntries } from "./workspace-add-menu-model";
import type { Workspace } from "./workspace-helpers";

function ws(
  id: string,
  closedAt: string | null = "2026-01-01T00:00:00.000Z",
): Workspace {
  return {
    id,
    name: id,
    folder: `/tmp/${id}`,
    createdAt: "2025-01-01T00:00:00.000Z",
    lastOpenedAt: "2025-01-01T00:00:00.000Z",
    closedAt,
    terminals: [],
    editors: [],
  };
}

describe("partitionSavedEntries", () => {
  it("passes through closed workspaces that are ungrouped", () => {
    const { groupEntries, workspaces } = partitionSavedEntries(
      [ws("a"), ws("b")],
      {},
    );
    expect(groupEntries).toEqual([]);
    expect(workspaces.map((w) => w.id)).toEqual(["a", "b"]);
  });

  it("passes through closed workspaces belonging to an open group", () => {
    const { groupEntries, workspaces } = partitionSavedEntries([ws("a")], {
      grp_1: { name: "Open Group", workspaceOrder: ["a"], closedAt: null },
    });
    expect(groupEntries).toEqual([]);
    expect(workspaces.map((w) => w.id)).toEqual(["a"]);
  });

  it("hides members of a closed group and lists the group instead", () => {
    const { groupEntries, workspaces } = partitionSavedEntries(
      [ws("a"), ws("b"), ws("solo")],
      {
        grp_1: {
          name: "Xerro",
          workspaceOrder: ["a", "b"],
          closedAt: "2026-02-01T00:00:00.000Z",
        },
      },
    );
    expect(workspaces.map((w) => w.id)).toEqual(["solo"]);
    expect(groupEntries).toEqual([
      {
        id: "grp_1",
        name: "Xerro",
        memberCount: 2,
        closedAt: "2026-02-01T00:00:00.000Z",
      },
    ]);
  });

  it("hides a member closed before the group closed too", () => {
    // "a" was individually closed before "grp_1" was closed as a whole.
    const { workspaces } = partitionSavedEntries([ws("a")], {
      grp_1: {
        name: "Xerro",
        workspaceOrder: ["a"],
        closedAt: "2026-02-01T00:00:00.000Z",
      },
    });
    expect(workspaces).toEqual([]);
  });

  it("sorts multiple closed groups by closedAt descending", () => {
    const { groupEntries } = partitionSavedEntries([], {
      old: {
        name: "Old",
        workspaceOrder: [],
        closedAt: "2026-01-01T00:00:00.000Z",
      },
      recent: {
        name: "Recent",
        workspaceOrder: [],
        closedAt: "2026-03-01T00:00:00.000Z",
      },
    });
    expect(groupEntries.map((g) => g.id)).toEqual(["recent", "old"]);
  });

  it("returns empty lists for empty input", () => {
    expect(partitionSavedEntries([], {})).toEqual({
      groupEntries: [],
      workspaces: [],
    });
  });
});

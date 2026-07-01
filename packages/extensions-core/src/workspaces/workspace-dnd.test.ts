import { describe, it, expect } from "vitest";
import {
  computeCardZone,
  computeDropPosition,
  dropTargetForDragOver,
  resolveBackgroundDrop,
  resolveGroupCardDrop,
  resolveGroupedRowDrop,
  resolveTopLevelDrop,
  sameDropTarget,
  type DropTarget,
} from "./workspace-dnd";

describe("computeDropPosition", () => {
  const rect = { top: 100, height: 20 }; // midpoint at y=110
  it("returns 'before' in the top half", () => {
    expect(computeDropPosition(101, rect)).toBe("before");
  });
  it("returns 'after' in the bottom half", () => {
    expect(computeDropPosition(119, rect)).toBe("after");
  });
  it("treats the exact midpoint as 'after' (strict <)", () => {
    expect(computeDropPosition(110, rect)).toBe("after");
  });
});

describe("dropTargetForDragOver", () => {
  it("returns null when nothing is being dragged", () => {
    expect(
      dropTargetForDragOver({
        draggingId: null,
        targetId: "a",
        position: "before",
      }),
    ).toBeNull();
  });
  it("returns null when hovering the dragged item itself", () => {
    expect(
      dropTargetForDragOver({
        draggingId: "a",
        targetId: "a",
        position: "after",
      }),
    ).toBeNull();
  });
  it("returns the target and edge otherwise", () => {
    expect(
      dropTargetForDragOver({
        draggingId: "a",
        targetId: "b",
        position: "after",
      }),
    ).toEqual({ id: "b", position: "after" });
  });
});

describe("sameDropTarget", () => {
  it("is true for both null", () => {
    expect(sameDropTarget(null, null)).toBe(true);
  });
  it("is false when only one is null", () => {
    expect(sameDropTarget({ id: "a", position: "before" }, null)).toBe(false);
  });
  it("compares id and position by value", () => {
    expect(
      sameDropTarget(
        { id: "a", position: "before" },
        { id: "a", position: "before" },
      ),
    ).toBe(true);
    expect(
      sameDropTarget(
        { id: "a", position: "before" },
        { id: "a", position: "after" },
      ),
    ).toBe(false);
  });
});

const dt: DropTarget = { id: "b", position: "after" };

describe("resolveTopLevelDrop", () => {
  it("returns null without a hovered target", () => {
    expect(
      resolveTopLevelDrop({
        draggingGroupId: "grp_1",
        draggingWorkspaceId: null,
        draggingSourceGroup: "",
        dropTarget: null,
        targetId: "b",
      }),
    ).toBeNull();
  });

  it("reorders the panel when a group is dropped on a top-level row", () => {
    expect(
      resolveTopLevelDrop({
        draggingGroupId: "grp_1",
        draggingWorkspaceId: null,
        draggingSourceGroup: "",
        dropTarget: dt,
      }),
    ).toEqual({
      kind: "reorder-panel",
      fromId: "grp_1",
      toId: "b",
      position: "after",
    });
  });

  it("reorders the panel for an ungrouped workspace", () => {
    expect(
      resolveTopLevelDrop({
        draggingGroupId: null,
        draggingWorkspaceId: "a",
        draggingSourceGroup: "",
        dropTarget: dt,
      }),
    ).toEqual({
      kind: "reorder-panel",
      fromId: "a",
      toId: "b",
      position: "after",
    });
  });

  it("ungroups a grouped workspace dropped on a top-level row", () => {
    expect(
      resolveTopLevelDrop({
        draggingGroupId: null,
        draggingWorkspaceId: "a",
        draggingSourceGroup: "grp_1",
        dropTarget: dt,
      }),
    ).toEqual({ kind: "ungroup", fromId: "a", toId: "b", position: "after" });
  });

  it("returns null when dropped on itself", () => {
    expect(
      resolveTopLevelDrop({
        draggingGroupId: "grp_1",
        draggingWorkspaceId: null,
        draggingSourceGroup: "",
        dropTarget: { id: "grp_1", position: "before" },
      }),
    ).toBeNull();
  });
});

describe("computeCardZone", () => {
  const rect = { top: 0, height: 100 }; // edges at <28 and >72
  it("returns 'before' near the top edge", () => {
    expect(computeCardZone(10, rect)).toBe("before");
  });
  it("returns 'into' in the middle", () => {
    expect(computeCardZone(50, rect)).toBe("into");
  });
  it("returns 'after' near the bottom edge", () => {
    expect(computeCardZone(90, rect)).toBe("after");
  });
});

describe("resolveGroupCardDrop", () => {
  it("reorders the panel when a group is dropped on another group card", () => {
    expect(
      resolveGroupCardDrop({
        draggingGroupId: "grp_1",
        draggingWorkspaceId: null,
        draggingSourceGroup: "",
        dropTarget: { id: "grp_2", position: "before" },
        targetGroupId: "grp_2",
      }),
    ).toEqual({
      kind: "reorder-panel",
      fromId: "grp_1",
      toId: "grp_2",
      position: "before",
    });
  });

  it("returns null when a group is dropped on itself", () => {
    expect(
      resolveGroupCardDrop({
        draggingGroupId: "grp_1",
        draggingWorkspaceId: null,
        draggingSourceGroup: "",
        dropTarget: { id: "grp_1", position: "before" },
        targetGroupId: "grp_1",
      }),
    ).toBeNull();
  });

  it("moves a workspace into the group when dropped on the middle (no edge target)", () => {
    expect(
      resolveGroupCardDrop({
        draggingGroupId: null,
        draggingWorkspaceId: "a",
        draggingSourceGroup: "",
        dropTarget: null,
        targetGroupId: "grp_2",
      }),
    ).toEqual({ kind: "move-to-group", groupId: "grp_2", fromId: "a" });
  });

  it("is a no-op when a workspace is dropped on the middle of its own group", () => {
    expect(
      resolveGroupCardDrop({
        draggingGroupId: null,
        draggingWorkspaceId: "a",
        draggingSourceGroup: "grp_2",
        dropTarget: null,
        targetGroupId: "grp_2",
      }),
    ).toBeNull();
  });

  it("places an ungrouped workspace adjacent to the group on an edge", () => {
    expect(
      resolveGroupCardDrop({
        draggingGroupId: null,
        draggingWorkspaceId: "a",
        draggingSourceGroup: "",
        dropTarget: { id: "grp_2", position: "after" },
        targetGroupId: "grp_2",
      }),
    ).toEqual({
      kind: "reorder-panel",
      fromId: "a",
      toId: "grp_2",
      position: "after",
    });
  });

  it("ungroups a grouped workspace adjacent to a group on an edge", () => {
    expect(
      resolveGroupCardDrop({
        draggingGroupId: null,
        draggingWorkspaceId: "a",
        draggingSourceGroup: "grp_1",
        dropTarget: { id: "grp_2", position: "before" },
        targetGroupId: "grp_2",
      }),
    ).toEqual({
      kind: "ungroup",
      fromId: "a",
      toId: "grp_2",
      position: "before",
    });
  });
});

describe("resolveGroupedRowDrop", () => {
  it("reorders within the group when source and target share it", () => {
    expect(
      resolveGroupedRowDrop({
        draggingWorkspaceId: "a",
        draggingSourceGroup: "grp_1",
        dropTarget: dt,
        targetId: "b",
        targetGroupId: "grp_1",
      }),
    ).toEqual({
      kind: "reorder-in-group",
      groupId: "grp_1",
      fromId: "a",
      toId: "b",
      position: "after",
    });
  });

  it("moves into the target group at the anchor when from elsewhere", () => {
    expect(
      resolveGroupedRowDrop({
        draggingWorkspaceId: "a",
        draggingSourceGroup: "",
        dropTarget: dt,
        targetId: "b",
        targetGroupId: "grp_2",
      }),
    ).toEqual({
      kind: "move-to-group",
      groupId: "grp_2",
      fromId: "a",
      toId: "b",
      position: "after",
    });
  });

  it("returns null on self or with no target", () => {
    expect(
      resolveGroupedRowDrop({
        draggingWorkspaceId: "a",
        draggingSourceGroup: "grp_1",
        dropTarget: { id: "a", position: "before" },
        targetId: "a",
        targetGroupId: "grp_1",
      }),
    ).toBeNull();
  });
});

describe("resolveBackgroundDrop", () => {
  const end: DropTarget = { id: "grp_z", position: "after" };
  const start: DropTarget = { id: "grp_a", position: "before" };

  it("reorders an ungrouped workspace to the chosen anchor (end)", () => {
    expect(
      resolveBackgroundDrop({
        draggingGroupId: null,
        draggingWorkspaceId: "a",
        draggingSourceGroup: "",
        dropTarget: end,
      }),
    ).toEqual({
      kind: "reorder-panel",
      fromId: "a",
      toId: "grp_z",
      position: "after",
    });
  });

  it("reorders a group to the beginning when anchored before the first entry", () => {
    expect(
      resolveBackgroundDrop({
        draggingGroupId: "grp_1",
        draggingWorkspaceId: null,
        draggingSourceGroup: "",
        dropTarget: start,
      }),
    ).toEqual({
      kind: "reorder-panel",
      fromId: "grp_1",
      toId: "grp_a",
      position: "before",
    });
  });

  it("ungroups a grouped workspace at the chosen anchor", () => {
    expect(
      resolveBackgroundDrop({
        draggingGroupId: null,
        draggingWorkspaceId: "a",
        draggingSourceGroup: "grp_1",
        dropTarget: end,
      }),
    ).toEqual({
      kind: "ungroup",
      fromId: "a",
      toId: "grp_z",
      position: "after",
    });
  });

  it("is a no-op when the dragged entity is the anchor itself", () => {
    expect(
      resolveBackgroundDrop({
        draggingGroupId: null,
        draggingWorkspaceId: "grp_z",
        draggingSourceGroup: "",
        dropTarget: end,
      }),
    ).toBeNull();
  });

  it("still ungroups (anchorless) when there is no anchor", () => {
    expect(
      resolveBackgroundDrop({
        draggingGroupId: null,
        draggingWorkspaceId: "a",
        draggingSourceGroup: "grp_1",
        dropTarget: null,
      }),
    ).toEqual({ kind: "ungroup", fromId: "a" });
  });

  it("is a no-op for an ungrouped workspace with no anchor", () => {
    expect(
      resolveBackgroundDrop({
        draggingGroupId: null,
        draggingWorkspaceId: "a",
        draggingSourceGroup: "",
        dropTarget: null,
      }),
    ).toBeNull();
  });
});

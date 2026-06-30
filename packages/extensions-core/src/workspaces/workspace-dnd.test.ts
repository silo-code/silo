import { describe, it, expect } from "vitest";
import {
  computeDropPosition,
  dropTargetForDragOver,
  resolveGroupDrop,
  resolveWorkspaceDrop,
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
      dropTargetForDragOver({ draggingId: null, targetId: "a", position: "before" }),
    ).toBeNull();
  });

  it("returns null when hovering the dragged item itself", () => {
    expect(
      dropTargetForDragOver({ draggingId: "a", targetId: "a", position: "after" }),
    ).toBeNull();
  });

  it("returns the target and edge otherwise", () => {
    expect(
      dropTargetForDragOver({ draggingId: "a", targetId: "b", position: "after" }),
    ).toEqual({ id: "b", position: "after" });
  });
});

describe("sameDropTarget", () => {
  it("is true for the same reference", () => {
    const t: DropTarget = { id: "a", position: "before" };
    expect(sameDropTarget(t, t)).toBe(true);
  });

  it("is true for both null", () => {
    expect(sameDropTarget(null, null)).toBe(true);
  });

  it("is false when only one is null", () => {
    expect(sameDropTarget({ id: "a", position: "before" }, null)).toBe(false);
    expect(sameDropTarget(null, { id: "a", position: "before" })).toBe(false);
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
        { id: "b", position: "before" },
      ),
    ).toBe(false);
    expect(
      sameDropTarget(
        { id: "a", position: "before" },
        { id: "a", position: "after" },
      ),
    ).toBe(false);
  });
});

describe("resolveWorkspaceDrop", () => {
  const dropTarget: DropTarget = { id: "b", position: "after" };

  it("returns null with no active drag", () => {
    expect(
      resolveWorkspaceDrop({
        draggingId: null,
        dropTarget,
        targetId: "b",
        sourceGroupId: "",
      }),
    ).toBeNull();
  });

  it("returns null with no hovered drop target", () => {
    expect(
      resolveWorkspaceDrop({
        draggingId: "a",
        dropTarget: null,
        targetId: "b",
        sourceGroupId: "",
      }),
    ).toBeNull();
  });

  it("returns null when dropped onto itself", () => {
    expect(
      resolveWorkspaceDrop({
        draggingId: "a",
        dropTarget: { id: "a", position: "before" },
        targetId: "a",
        sourceGroupId: "",
      }),
    ).toBeNull();
  });

  it("reorders within a group when source and target share that group", () => {
    expect(
      resolveWorkspaceDrop({
        draggingId: "a",
        dropTarget,
        targetId: "b",
        sourceGroupId: "grp_1",
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

  it("reorders the global order for ungrouped rows", () => {
    expect(
      resolveWorkspaceDrop({
        draggingId: "a",
        dropTarget,
        targetId: "b",
        sourceGroupId: "",
      }),
    ).toEqual({
      kind: "reorder-global",
      fromId: "a",
      toId: "b",
      position: "after",
    });
  });

  it("falls back to global reorder across different groups", () => {
    expect(
      resolveWorkspaceDrop({
        draggingId: "a",
        dropTarget,
        targetId: "b",
        sourceGroupId: "grp_1",
        targetGroupId: "grp_2",
      }),
    ).toMatchObject({ kind: "reorder-global" });
  });

  it("falls back to global reorder when the target is grouped but source is not", () => {
    expect(
      resolveWorkspaceDrop({
        draggingId: "a",
        dropTarget,
        targetId: "b",
        sourceGroupId: "",
        targetGroupId: "grp_2",
      }),
    ).toMatchObject({ kind: "reorder-global" });
  });
});

describe("resolveGroupDrop", () => {
  const groupDropTarget: DropTarget = { id: "grp_b", position: "before" };

  it("returns null with no active group drag", () => {
    expect(
      resolveGroupDrop({
        draggingGroupId: null,
        groupDropTarget,
        targetGroupId: "grp_b",
      }),
    ).toBeNull();
  });

  it("returns null with no hovered group target", () => {
    expect(
      resolveGroupDrop({
        draggingGroupId: "grp_a",
        groupDropTarget: null,
        targetGroupId: "grp_b",
      }),
    ).toBeNull();
  });

  it("returns null when dropped onto itself", () => {
    expect(
      resolveGroupDrop({
        draggingGroupId: "grp_a",
        groupDropTarget: { id: "grp_a", position: "before" },
        targetGroupId: "grp_a",
      }),
    ).toBeNull();
  });

  it("resolves a group reorder", () => {
    expect(
      resolveGroupDrop({
        draggingGroupId: "grp_a",
        groupDropTarget,
        targetGroupId: "grp_b",
      }),
    ).toEqual({
      kind: "reorder-groups",
      fromId: "grp_a",
      toId: "grp_b",
      position: "before",
    });
  });
});

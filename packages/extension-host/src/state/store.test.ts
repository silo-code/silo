import { describe, it, expect, beforeEach } from "vitest";
import {
  cloneNode,
  pane,
  paneIds,
  resolvePaneId,
  split,
} from "./side-dock-tree";
import {
  store,
  isSidePanelVisible,
  toggleSidePanelVisibility,
  collapseStateByMode,
  swapCollapseMode,
  setSideDockSizes,
  setSidePanelSlot,
  splitSideDock,
} from "./store";

describe("side-panel visibility", () => {
  beforeEach(() => {
    store.sidePanelVisibility = {};
  });

  it("defaults to visible when no entry is stored", () => {
    expect(isSidePanelVisible("explorer")).toBe(true);
  });

  it("reports hidden once an explicit false is stored", () => {
    store.sidePanelVisibility.explorer = false;
    expect(isSidePanelVisible("explorer")).toBe(false);
  });

  it("hiding a visible panel stores an explicit false", () => {
    toggleSidePanelVisibility("explorer");
    expect(store.sidePanelVisibility.explorer).toBe(false);
    expect(isSidePanelVisible("explorer")).toBe(false);
  });

  it("showing a hidden panel deletes the key (back to default-visible)", () => {
    store.sidePanelVisibility.explorer = false;
    toggleSidePanelVisibility("explorer");
    expect("explorer" in store.sidePanelVisibility).toBe(false);
    expect(isSidePanelVisible("explorer")).toBe(true);
  });

  it("toggles back and forth without leaking other keys", () => {
    toggleSidePanelVisibility("a");
    toggleSidePanelVisibility("a");
    expect(store.sidePanelVisibility).toEqual({});
  });
});

describe("the two side-column layout modes", () => {
  beforeEach(() => {
    store.leftPanelCollapsed = false;
    store.rightPanelCollapsed = false;
    store.smallScreenActive = false;
    store.inactiveModeCollapsed = null;
  });

  it("sorts the live pair into the normal slot off a small screen", () => {
    store.leftPanelCollapsed = true;
    expect(collapseStateByMode()).toEqual({
      normal: { left: true, right: false },
      smallScreen: null,
    });
  });

  it("sorts the live pair into the small-screen slot while narrow", () => {
    store.smallScreenActive = true;
    store.inactiveModeCollapsed = { left: true, right: false };
    store.rightPanelCollapsed = true;
    expect(collapseStateByMode()).toEqual({
      normal: { left: true, right: false },
      smallScreen: { left: false, right: true },
    });
  });

  it("swaps the live and parked modes, so a round trip is a no-op", () => {
    store.leftPanelCollapsed = true; // the normal-width layout
    store.inactiveModeCollapsed = { left: false, right: true };

    swapCollapseMode({ left: true, right: true });
    expect(store.leftPanelCollapsed).toBe(false);
    expect(store.rightPanelCollapsed).toBe(true);
    expect(store.inactiveModeCollapsed).toEqual({ left: true, right: false });

    swapCollapseMode({ left: false, right: false });
    expect(store.leftPanelCollapsed).toBe(true);
    expect(store.rightPanelCollapsed).toBe(false);
  });

  it("falls back to the given layout when the mode being entered has none", () => {
    swapCollapseMode({ left: true, right: true });
    expect(store.leftPanelCollapsed).toBe(true);
    expect(store.rightPanelCollapsed).toBe(true);
    expect(store.inactiveModeCollapsed).toEqual({ left: false, right: false });
  });
});

describe("setSideDockSizes", () => {
  beforeEach(() => {
    store.sideDockTrees = {
      left: split("column", [pane("left"), pane("left-bottom")], [55, 45]),
      right: pane("right"),
    };
  });

  it("records what a drag produced, rescaled to sum to 100", () => {
    setSideDockSizes("left", [], ["left", "left-bottom"], [70.5, 29.5]);
    const left = store.sideDockTrees.left;
    expect(left.type === "split" && left.sizes).toEqual([70.5, 29.5]);
  });

  it("writes a nested split by path, leaving the parent alone", () => {
    store.sideDockTrees.right = split(
      "row",
      [pane("right"), split("column", [pane("p2"), pane("p3")], [50, 50])],
      [60, 40],
    );
    setSideDockSizes("right", [1], ["p2", "p3"], [25, 75]);
    const root = store.sideDockTrees.right;
    expect(root.type === "split" && root.sizes).toEqual([60, 40]);
    const nested = root.type === "split" ? root.children[1] : null;
    expect(nested?.type === "split" && nested.sizes).toEqual([25, 75]);
  });

  it("ignores a resize aimed at a pane or a path that is not there", () => {
    const before = cloneNode(store.sideDockTrees.right);
    setSideDockSizes("right", [], ["right"], [50, 50]); // a lone pane
    expect(store.sideDockTrees.right).toEqual(before);

    const leftBefore = cloneNode(store.sideDockTrees.left);
    setSideDockSizes("left", [7], ["left", "left-bottom"], [50, 50]);
    expect(store.sideDockTrees.left).toEqual(leftBefore);
  });
});

describe("splitSideDock", () => {
  beforeEach(() => {
    store.sideDockTrees = { left: pane("left"), right: pane("right") };
    store.sidePanelLocations = {};
  });

  it("finds the pane's dock without being told which one", () => {
    const newPaneId = splitSideDock("right", "right");
    expect(newPaneId).not.toBeNull();
    expect(paneIds(store.sideDockTrees.right)).toEqual(["right", newPaneId]);
    expect(paneIds(store.sideDockTrees.left)).toEqual(["left"]); // untouched
  });

  it("returns null for a pane that is in neither dock", () => {
    expect(splitSideDock("nope", "bottom")).toBeNull();
  });

  it("mints ids that do not collide across repeated splits", () => {
    const a = splitSideDock("left", "bottom");
    const b = splitSideDock("left", "bottom");
    expect(a).not.toBe(b);
    expect(new Set(paneIds(store.sideDockTrees.left)).size).toBe(3);
  });

  it("places a panel in the new pane and keeps it there", () => {
    const newPaneId = splitSideDock("left", "right")!;
    setSidePanelSlot("git", newPaneId);
    expect(store.sidePanelLocations.git).toBe(newPaneId);
    expect(paneIds(store.sideDockTrees.left)).toContain(newPaneId);
  });
});

describe("a panel placed in a pane a split created", () => {
  beforeEach(() => {
    store.sideDockTrees = { left: pane("left"), right: pane("right") };
    store.sidePanelLocations = {};
  });

  // The bug this pins: a minted pane id is not one of the four legacy slot
  // strings, so a resolver that validated against a fixed list sent the panel
  // straight back to its registered dock. The pane then had no occupants, the
  // dock filtered it out, and dropping a tab on an edge did nothing at all.
  it("resolves into the new pane, not back to its registered dock", () => {
    const newPaneId = splitSideDock("right", "right")!;
    setSidePanelSlot("git", newPaneId);
    expect(resolvePaneId(store.sideDockTrees, newPaneId, "right")).toBe(
      newPaneId,
    );
  });

  it("resolves across docks — a pane id names a pane, not a side", () => {
    const newPaneId = splitSideDock("left", "bottom")!;
    setSidePanelSlot("git", newPaneId);
    // Registered right, placed in a left-dock pane: the placement wins.
    expect(resolvePaneId(store.sideDockTrees, newPaneId, "right")).toBe(
      newPaneId,
    );
  });

  it("falls back to the registered dock's first pane for an unknown id", () => {
    expect(resolvePaneId(store.sideDockTrees, "gone", "left")).toBe("left");
    expect(resolvePaneId(store.sideDockTrees, undefined, "right")).toBe(
      "right",
    );
  });
});

describe("retiring a pane", () => {
  beforeEach(() => {
    store.sideDockTrees = { left: pane("left"), right: pane("right") };
    store.sidePanelLocations = {};
  });

  it("drops a pane when its last panel moves out", () => {
    const newPaneId = splitSideDock("left", "bottom")!;
    setSidePanelSlot("git", newPaneId);
    expect(paneIds(store.sideDockTrees.left)).toEqual(["left", newPaneId]);

    setSidePanelSlot("git", "left");
    expect(store.sideDockTrees.left).toEqual(pane("left"));
  });

  it("keeps a pane that still holds another panel", () => {
    const newPaneId = splitSideDock("left", "bottom")!;
    setSidePanelSlot("git", newPaneId);
    setSidePanelSlot("terminal", newPaneId);

    setSidePanelSlot("git", "left");
    expect(paneIds(store.sideDockTrees.left)).toEqual(["left", newPaneId]);
  });

  it("never retires a dock's own root pane", () => {
    // Nothing is placed anywhere: every panel is in its registered dock, which
    // no sidePanelLocations entry names.
    setSidePanelSlot("git", null);
    expect(store.sideDockTrees).toEqual({
      left: pane("left"),
      right: pane("right"),
    });
  });

  // Hiding a panel doesn't move it, so its pane must survive — that's what
  // makes un-hiding put it back where it was rather than in the dock root.
  it("survives its panels being hidden", () => {
    const newPaneId = splitSideDock("right", "bottom")!;
    setSidePanelSlot("git", newPaneId);
    toggleSidePanelVisibility("git");
    expect(paneIds(store.sideDockTrees.right)).toEqual(["right", newPaneId]);
    toggleSidePanelVisibility("git");
    expect(store.sidePanelLocations.git).toBe(newPaneId);
  });
});

import { describe, it, expect, beforeEach } from "vitest";
import { cloneNode, pane, split } from "./side-dock-tree";
import {
  store,
  isSidePanelVisible,
  toggleSidePanelVisibility,
  collapseStateByMode,
  swapCollapseMode,
  setSideDockSizes,
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
    setSideDockSizes("left", [], [70.5, 29.5]);
    const left = store.sideDockTrees.left;
    expect(left.type === "split" && left.sizes).toEqual([70.5, 29.5]);
  });

  it("writes a nested split by path, leaving the parent alone", () => {
    store.sideDockTrees.right = split(
      "row",
      [pane("right"), split("column", [pane("p2"), pane("p3")], [50, 50])],
      [60, 40],
    );
    setSideDockSizes("right", [1], [25, 75]);
    const root = store.sideDockTrees.right;
    expect(root.type === "split" && root.sizes).toEqual([60, 40]);
    const nested = root.type === "split" ? root.children[1] : null;
    expect(nested?.type === "split" && nested.sizes).toEqual([25, 75]);
  });

  it("ignores a resize aimed at a pane or a path that is not there", () => {
    const before = cloneNode(store.sideDockTrees.right);
    setSideDockSizes("right", [], [50, 50]); // right is a lone pane
    expect(store.sideDockTrees.right).toEqual(before);

    const leftBefore = cloneNode(store.sideDockTrees.left);
    setSideDockSizes("left", [7], [50, 50]);
    expect(store.sideDockTrees.left).toEqual(leftBefore);
  });
});

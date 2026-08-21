import { describe, it, expect, beforeEach } from "vitest";
import { store } from "./store";
import {
  capturePanelState,
  applyPanelState,
  captureGlobalPanelLayout,
  applyGlobalPanelLayout,
} from "./panel-state";
import { DEFAULT_PANEL_STATE } from "./types";
import { pane, paneIds, split } from "./side-dock-tree";
import type { WorkspaceInternal } from "./types";

function makeWorkspace(id: string): WorkspaceInternal {
  return {
    id,
    name: id,
    folder: `/ws/${id}`,
    createdAt: "",
    lastOpenedAt: "",
    terminals: [],
    editors: [],
    dockLayout: null,
  };
}

/** A live store with every panel field set to something distinctive, so a
 * field dropped from either half of the mapping shows up as a difference. */
function seedLiveState(): void {
  store.sideDockTrees = {
    left: split("column", [pane("left"), pane("left-bottom")], [70, 30]),
    right: pane("right"),
  };
  store.sidePanelLocations = { explorer: "left" };
  store.sidePanelOrder = { explorer: 2 };
  store.activeSidePanelTabs = { left: "explorer" };
  store.sidePanelScrollPositions = { explorer: 12 };
  store.sidePanelVisibility = { themes: false };
  store.extensionState = { "silo.explorer": { expanded: ["/a"] } };
  store.leftPanelCollapsed = true;
  store.rightPanelCollapsed = false;
}

beforeEach(() => {
  Object.assign(store, structuredClone(DEFAULT_PANEL_STATE));
  store.leftPanelCollapsed = false;
  store.rightPanelCollapsed = false;
  store.smallScreenActive = false;
  store.inactiveModeCollapsed = null;
});

describe("capturePanelState / applyPanelState", () => {
  it("round-trips every field — capture, apply, capture is identity", () => {
    // The assertion that catches a field missing from *either* function: drop
    // one from capture and the first snapshot loses it; drop one from apply
    // and the second does.
    seedLiveState();
    const first = capturePanelState();

    applyPanelState({ ...makeWorkspace("a"), ...first });
    expect(capturePanelState()).toEqual(first);
  });

  it("round-trips the small-screen layout too", () => {
    seedLiveState();
    store.smallScreenActive = true;
    store.inactiveModeCollapsed = { left: false, right: true };
    const first = capturePanelState();
    expect(first.smallScreenCollapsed).toEqual({ left: true, right: false });

    applyPanelState({ ...makeWorkspace("a"), ...first });
    expect(capturePanelState()).toEqual(first);
  });

  it("omits the small-screen layout for a workspace that has never been narrow", () => {
    seedLiveState();
    expect("smallScreenCollapsed" in capturePanelState()).toBe(false);
  });

  it("copies out of the live store, so a saved record can't be rewritten by later edits", () => {
    seedLiveState();
    const snapshot = capturePanelState();

    store.sidePanelVisibility.explorer = false;
    store.extensionState["silo.new"] = { added: true };
    store.extensionState["silo.explorer"].expanded = ["/b"];

    expect(snapshot.sidePanelVisibility).toEqual({ themes: false });
    expect(snapshot.extensionState).toEqual({
      "silo.explorer": { expanded: ["/a"] },
    });
  });

  it("copies out of the record, so the live store isn't aliased to it", () => {
    const ws = { ...makeWorkspace("a"), ...capturePanelState() };
    seedLiveState();
    applyPanelState(ws);

    store.sidePanelVisibility.themes = false;
    store.extensionState["silo.new"] = { added: true };

    expect(ws.sidePanelVisibility).toEqual({});
    expect(ws.extensionState).toEqual({});
  });

  it("hydrates an older record with no panel fields to empty defaults", () => {
    seedLiveState();
    applyPanelState(makeWorkspace("older"));

    expect(store.sidePanelLocations).toEqual({});
    expect(store.sidePanelVisibility).toEqual({});
    expect(store.extensionState).toEqual({});
    expect(store.leftPanelCollapsed).toBe(false);
    expect(store.inactiveModeCollapsed).toBeNull();
  });
});

describe("captureGlobalPanelLayout / applyGlobalPanelLayout", () => {
  it("round-trips every arrangement field — capture, apply, capture is identity", () => {
    seedLiveState();
    const first = captureGlobalPanelLayout();

    applyGlobalPanelLayout(first);
    expect(captureGlobalPanelLayout()).toEqual(first);
  });

  it("does not carry activeSidePanelTabs, sidePanelScrollPositions, or extensionState", () => {
    seedLiveState();
    const g = captureGlobalPanelLayout();
    expect(g).not.toHaveProperty("activeSidePanelTabs");
    expect(g).not.toHaveProperty("sidePanelScrollPositions");
    expect(g).not.toHaveProperty("extensionState");
  });

  it("round-trips the small-screen layout too", () => {
    seedLiveState();
    store.smallScreenActive = true;
    store.inactiveModeCollapsed = { left: false, right: true };
    const first = captureGlobalPanelLayout();
    expect(first.smallScreenCollapsed).toEqual({ left: true, right: false });

    applyGlobalPanelLayout(first);
    expect(captureGlobalPanelLayout()).toEqual(first);
  });

  it("copies out of the live store, so a captured record can't be rewritten by later edits", () => {
    seedLiveState();
    const snapshot = captureGlobalPanelLayout();

    store.sidePanelVisibility.explorer = false;
    store.sidePanelLocations.explorer = "right";

    expect(snapshot.sidePanelVisibility).toEqual({ themes: false });
    expect(snapshot.sidePanelLocations).toEqual({ explorer: "left" });
  });

  it("copies out of the record, so the live store isn't aliased to it", () => {
    const g = captureGlobalPanelLayout(); // empty, pre-seed
    seedLiveState();
    applyGlobalPanelLayout(g); // overwrites live back to empty

    store.sidePanelVisibility.themes = false;

    expect(g.sidePanelVisibility).toEqual({});
  });
});

describe("side dock trees", () => {
  it("does not alias the record's trees into the live store", () => {
    seedLiveState();
    const snapshot = capturePanelState();
    // Mutating the live tree after capture must not reach the snapshot.
    store.sideDockTrees.right = split("row", [pane("right"), pane("p2")]);
    expect(paneIds(snapshot.sideDockTrees.right)).toEqual(["right"]);

    applyPanelState({ ...makeWorkspace("a"), ...snapshot });
    store.sideDockTrees.left = pane("left");
    expect(paneIds(snapshot.sideDockTrees.left)).toEqual([
      "left",
      "left-bottom",
    ]);
  });

  // RFC 0027: a record written before the tree existed carries only
  // sidePanelLocations, and the arrangement it implies is recoverable from it.
  it("derives the trees for a record that predates them", () => {
    applyPanelState({
      ...makeWorkspace("legacy"),
      sidePanelLocations: { explorer: "left", git: "right-bottom" },
    });
    expect(paneIds(store.sideDockTrees.left)).toEqual(["left"]);
    expect(paneIds(store.sideDockTrees.right)).toEqual([
      "right",
      "right-bottom",
    ]);
  });

  it("gives a record with no panel state at all the default docks", () => {
    applyPanelState(makeWorkspace("fresh"));
    expect(store.sideDockTrees).toEqual({
      left: pane("left"),
      right: pane("right"),
    });
  });

  it("normalizes a stored tree rather than trusting it", () => {
    applyPanelState({
      ...makeWorkspace("hand-edited"),
      sidePanelLocations: {},
      // A one-child split and a sizes array that sums to nothing like 100.
      sideDockTrees: {
        left: split("row", [pane("left")], [100]),
        right: split("column", [pane("right"), pane("right-bottom")], [3, 1]),
      },
    });
    expect(store.sideDockTrees.left).toEqual(pane("left"));
    const right = store.sideDockTrees.right;
    expect(right.type).toBe("split");
    expect(right.type === "split" && right.sizes).toEqual([75, 25]);
  });

  it("derives the global layout's trees when the index predates them", () => {
    applyGlobalPanelLayout({
      sidePanelLocations: { git: "left-bottom" },
      sidePanelOrder: {},
      sidePanelVisibility: {},
      leftPanelCollapsed: false,
      rightPanelCollapsed: false,
    });
    expect(paneIds(store.sideDockTrees.left)).toEqual(["left", "left-bottom"]);
  });
});

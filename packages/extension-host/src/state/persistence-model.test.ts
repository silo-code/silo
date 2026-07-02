import { describe, it, expect } from "vitest";
import type { WorkspaceInternal } from "./types";
import {
  buildIndex,
  diffWorkspaceWrites,
  reconcilePanelOrder,
  reconcileWorkspaceListing,
  splitPersistedState,
  withActivePanelState,
  type LegacyPersisted,
  type PanelState,
  type PersistedIndex,
} from "./persistence-model";

function makeWorkspace(
  id: string,
  extra: Partial<WorkspaceInternal> = {},
): WorkspaceInternal {
  return {
    id,
    name: id,
    folder: `/ws/${id}`,
    createdAt: "",
    lastOpenedAt: "",
    terminals: [],
    editors: [],
    dockLayout: null,
    ...extra,
  };
}

const PANEL: PanelState = {
  sidePanelLocations: { explorer: "left" },
  sidePanelOrder: { explorer: 0 },
  activeSidePanelTabs: { left: "explorer" },
  sidePanelScrollPositions: { explorer: 12 },
  sidePanelVisibility: { themes: false },
  extensionState: { "silo.explorer": { expanded: ["/a"] } },
  leftPanelCollapsed: true,
  rightPanelCollapsed: false,
};

describe("splitPersistedState", () => {
  it("extracts workspaces and carries order/active/settings into the index", () => {
    const legacy: LegacyPersisted = {
      workspaces: { a: makeWorkspace("a"), b: makeWorkspace("b") },
      workspaceOrder: ["b", "a"],
      activeWorkspaceId: "a",
      uiFontSize: 15,
      activeThemeId: "light",
      editorSettings: { tabSize: 4 },
      terminalSettings: { cursorStyle: "bar" },
    };
    const { index, workspaces } = splitPersistedState(legacy);
    expect(Object.keys(workspaces).sort()).toEqual(["a", "b"]);
    expect(index.workspaceOrder).toEqual(["b", "a"]);
    expect(index.activeWorkspaceId).toBe("a");
    expect(index.uiFontSize).toBe(15);
    expect(index.activeThemeId).toBe("light");
    expect(index.editorSettings).toEqual({ tabSize: 4 });
    expect(index.terminalSettings).toEqual({ cursorStyle: "bar" });
  });

  it("falls back order to the workspace keys when absent", () => {
    const legacy = {
      workspaces: { a: makeWorkspace("a") },
      activeWorkspaceId: null,
    } as unknown as LegacyPersisted;
    const { index } = splitPersistedState(legacy);
    expect(index.workspaceOrder).toEqual(["a"]);
    expect(index.activeWorkspaceId).toBeNull();
  });

  it("handles an empty/missing workspaces map", () => {
    const { index, workspaces } = splitPersistedState({
      activeWorkspaceId: null,
    } as unknown as LegacyPersisted);
    expect(workspaces).toEqual({});
    expect(index.workspaceOrder).toEqual([]);
  });

  it("carries legacy top-level panel state onto the active workspace only when it lacks its own", () => {
    const legacy: LegacyPersisted = {
      workspaces: { a: makeWorkspace("a"), b: makeWorkspace("b") },
      workspaceOrder: ["a", "b"],
      activeWorkspaceId: "a",
      sidePanelLocations: { explorer: "right" },
      sidePanelOrder: { explorer: 2 },
      activeSidePanelTabs: { right: "explorer" },
      sidePanelScrollPositions: { explorer: 9 },
      extensionState: { "silo.x": { k: 1 } },
    };
    const { workspaces } = splitPersistedState(legacy);
    expect(workspaces.a.sidePanelLocations).toEqual({ explorer: "right" });
    expect(workspaces.a.extensionState).toEqual({ "silo.x": { k: 1 } });
    // The non-active workspace is untouched.
    expect(workspaces.b.sidePanelLocations).toBeUndefined();
  });

  it("does not overwrite a workspace that already has its own panel state", () => {
    const legacy: LegacyPersisted = {
      workspaces: {
        a: makeWorkspace("a", { sidePanelLocations: { explorer: "left" } }),
      },
      workspaceOrder: ["a"],
      activeWorkspaceId: "a",
      sidePanelLocations: { explorer: "right" },
    };
    const { workspaces } = splitPersistedState(legacy);
    expect(workspaces.a.sidePanelLocations).toEqual({ explorer: "left" });
  });
});

describe("withActivePanelState", () => {
  it("merges the live panel state onto the workspace", () => {
    const merged = withActivePanelState(makeWorkspace("a"), PANEL);
    expect(merged.sidePanelLocations).toEqual({ explorer: "left" });
    expect(merged.sidePanelScrollPositions).toEqual({ explorer: 12 });
    expect(merged.sidePanelVisibility).toEqual({ themes: false });
    expect(merged.extensionState).toEqual({
      "silo.explorer": { expanded: ["/a"] },
    });
    expect(merged.leftPanelCollapsed).toBe(true);
    expect(merged.rightPanelCollapsed).toBe(false);
  });

  it("isolates the visibility bag from the source panel state", () => {
    const merged = withActivePanelState(makeWorkspace("a"), PANEL);
    merged.sidePanelVisibility!.explorer = false;
    expect(PANEL.sidePanelVisibility.explorer).toBeUndefined();
  });

  it("does not mutate the source workspace and isolates the extension-state bag", () => {
    const ws = makeWorkspace("a");
    const merged = withActivePanelState(ws, PANEL);
    expect(ws.sidePanelLocations).toBeUndefined();
    // Two-level isolation: adding/replacing entries in the merged bag (or a
    // per-extension object) must not bleed back into PANEL's bag.
    merged.extensionState!["silo.new"] = { added: true };
    merged.extensionState!["silo.explorer"] = { replaced: true };
    expect(PANEL.extensionState["silo.new"]).toBeUndefined();
    expect(PANEL.extensionState["silo.explorer"]).toEqual({ expanded: ["/a"] });
  });
});

describe("diffWorkspaceWrites", () => {
  it("flags new and changed ids to write, removed ids to delete, leaves unchanged", () => {
    const prev = new Map([
      ["a", "1"],
      ["b", "2"],
      ["c", "3"],
    ]);
    const next = new Map([
      ["a", "1"], // unchanged
      ["b", "9"], // changed
      ["d", "4"], // new
    ]);
    const { toWrite, toDelete } = diffWorkspaceWrites(prev, next);
    expect(toWrite.sort()).toEqual(["b", "d"]);
    expect(toDelete).toEqual(["c"]);
  });

  it("is a no-op when snapshots match", () => {
    const m = new Map([["a", "1"]]);
    expect(diffWorkspaceWrites(m, new Map([["a", "1"]]))).toEqual({
      toWrite: [],
      toDelete: [],
    });
  });

  it("writes everything from empty and deletes everything to empty", () => {
    const full = new Map([["a", "1"]]);
    expect(diffWorkspaceWrites(new Map(), full).toWrite).toEqual(["a"]);
    expect(diffWorkspaceWrites(full, new Map()).toDelete).toEqual(["a"]);
  });
});

describe("reconcileWorkspaceListing", () => {
  const idx = (over: Partial<PersistedIndex>): PersistedIndex => ({
    workspaceOrder: [],
    activeWorkspaceId: null,
    ...over,
  });

  it("keeps the index order for listed workspaces and the active id", () => {
    const r = reconcileWorkspaceListing(
      idx({ workspaceOrder: ["b", "a"], activeWorkspaceId: "a" }),
      ["a", "b"],
    );
    expect(r.workspaceOrder).toEqual(["b", "a"]);
    expect(r.activeWorkspaceId).toBe("a");
  });

  it("recovers on-disk workspaces missing from the index order (self-healing)", () => {
    // A lost/empty index order must NOT hide workspace files that exist on disk;
    // they're appended back rather than orphaned.
    const r = reconcileWorkspaceListing(
      idx({ workspaceOrder: [], activeWorkspaceId: null }),
      ["a", "b", "c", "d"],
    );
    expect(r.workspaceOrder).toEqual(["a", "b", "c", "d"]);
  });

  it("appends orphans after the ordered entries, preserving index order first", () => {
    const r = reconcileWorkspaceListing(
      idx({ workspaceOrder: ["b"], activeWorkspaceId: "b" }),
      ["a", "b", "c"],
    );
    // "b" keeps its index position; "a" and "c" (on disk, not in order) follow.
    expect(r.workspaceOrder).toEqual(["b", "a", "c"]);
    expect(r.activeWorkspaceId).toBe("b");
  });

  it("drops ordered ids whose file didn't load, and reseats a dangling active", () => {
    const r = reconcileWorkspaceListing(
      idx({ workspaceOrder: ["a", "gone", "b"], activeWorkspaceId: "gone" }),
      ["a", "b"],
    );
    expect(r.workspaceOrder).toEqual(["a", "b"]);
    expect(r.activeWorkspaceId).toBe("a");
  });

  it("active falls to null when nothing is left", () => {
    const r = reconcileWorkspaceListing(
      idx({ workspaceOrder: ["gone"], activeWorkspaceId: "gone" }),
      [],
    );
    expect(r.workspaceOrder).toEqual([]);
    expect(r.activeWorkspaceId).toBeNull();
  });

  it("with no index, derives order from loaded ids and leaves active null", () => {
    const r = reconcileWorkspaceListing(null, ["a", "b"]);
    expect(r.workspaceOrder).toEqual(["a", "b"]);
    expect(r.activeWorkspaceId).toBeNull();
  });
});

describe("buildIndex", () => {
  it("copies containers so the result doesn't alias the input", () => {
    const order = ["a", "b"];
    const editorSettings = { tabSize: 2 };
    const index = buildIndex({
      workspaceOrder: order,
      activeWorkspaceId: "a",
      editorSettings,
    });
    order.push("c");
    editorSettings.tabSize = 8;
    expect(index.workspaceOrder).toEqual(["a", "b"]);
    expect(index.editorSettings).toEqual({ tabSize: 2 });
  });

  it("preserves undefined optional fields", () => {
    const index = buildIndex({ workspaceOrder: [], activeWorkspaceId: null });
    expect(index.editorSettings).toBeUndefined();
    expect(index.terminalSettings).toBeUndefined();
    expect(index.uiFontSize).toBeUndefined();
  });

  it("round-trips group fields when provided", () => {
    const groups = {
      grp_1: {
        id: "grp_1",
        name: "Work",
        collapsed: false,
        workspaceOrder: ["ws_a"],
      },
    };
    const index = buildIndex({
      workspaceOrder: ["ws_a"],
      activeWorkspaceId: "ws_a",
      groups,
      panelOrder: ["grp_1", "ws_a"],
    });
    expect(index.groups).toEqual(groups);
    expect(index.panelOrder).toEqual(["grp_1", "ws_a"]);
    // Must be copies, not the same references
    expect(index.groups).not.toBe(groups);
    expect(index.panelOrder).not.toBe(["grp_1", "ws_a"]);
  });

  it("deep-clones group workspaceOrder arrays", () => {
    const workspaceOrder = ["ws_a"];
    const groups = {
      grp_1: { id: "grp_1", name: "G", collapsed: false, workspaceOrder },
    };
    const index = buildIndex({
      workspaceOrder: [],
      activeWorkspaceId: null,
      groups,
    });
    workspaceOrder.push("ws_b");
    expect(index.groups!["grp_1"].workspaceOrder).toEqual(["ws_a"]);
  });

  it("omits group fields when not provided", () => {
    const index = buildIndex({ workspaceOrder: [], activeWorkspaceId: null });
    expect(index.groups).toBeUndefined();
    expect(index.panelOrder).toBeUndefined();
  });
});

describe("reconcilePanelOrder", () => {
  const groups = { grp_1: { workspaceOrder: ["ws_b"] } };

  it("reconstructs ungrouped-then-groups when no saved order (pre-panelOrder index)", () => {
    // ws_b is grouped, so it's excluded from the top level.
    expect(
      reconcilePanelOrder(undefined, groups, ["ws_a", "ws_b", "ws_c"]),
    ).toEqual(["ws_a", "ws_c", "grp_1"]);
  });

  it("keeps the saved order and excludes grouped workspaces", () => {
    expect(
      reconcilePanelOrder(["grp_1", "ws_a", "ws_c"], groups, [
        "ws_a",
        "ws_b",
        "ws_c",
      ]),
    ).toEqual(["grp_1", "ws_a", "ws_c"]);
  });

  it("drops stale saved ids and appends any top-level entry the saved order missed", () => {
    // saved references ws_gone (deleted) and omits ws_c and grp_1.
    expect(
      reconcilePanelOrder(["ws_gone", "ws_a"], groups, [
        "ws_a",
        "ws_b",
        "ws_c",
      ]),
    ).toEqual(["ws_a", "ws_c", "grp_1"]);
  });

  it("never lists a grouped workspace at the top level even if saved does", () => {
    expect(
      reconcilePanelOrder(["ws_b", "ws_a"], groups, ["ws_a", "ws_b"]),
    ).toEqual(["ws_a", "grp_1"]);
  });
});

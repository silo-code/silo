import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import type { WorkspaceInternal } from "./types";

// removeEditor fire-and-forgets a backup clear; mock the backup module so the
// test asserts the call without touching the Tauri fs boundary.
vi.mock("./editor-backups", () => ({
  clearEditorBackup: vi.fn(() => Promise.resolve()),
}));

import { store } from "./store";
import {
  openEditor,
  openDiff,
  removeEditor,
  retargetEditorsForRename,
  savePanelStateToWorkspace,
  setSharedColumnWidthsEnabled,
  loadPanelStateFromWorkspace,
  activateWorkspace,
  setEditorSettingOverride,
  getEditorSettingOverride,
  addExtraFolder,
  removeExtraFolder,
  setGlobalPanelLayoutEnabled,
  setGlobalActiveTabEnabled,
  hasSavedGlobalPanelLayout,
  enableGlobalPanelLayout,
} from "./workspaces";
import { clearEditorBackup } from "./editor-backups";
import { DEFAULT_GLOBAL_PANEL_LAYOUT } from "./types";
import { DEFAULT_SHARED_COLUMN_WIDTHS } from "./types";

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
    previewEditorId: null,
  };
}

beforeEach(() => {
  store.workspaces = { w: makeWorkspace("w") };
  store.workspaceOrder = ["w"];
  store.activeWorkspaceId = "w";
  vi.mocked(clearEditorBackup).mockClear();
});

describe("removeEditor", () => {
  it("clears the editor's hot-exit backup when a tab closes", () => {
    const rec = openEditor("w", "/ws/w/a.ts");
    removeEditor("w", rec.id);
    expect(clearEditorBackup).toHaveBeenCalledWith(rec.id);
  });

  it("does nothing for an unknown editor id", () => {
    expect(removeEditor("w", "nope")).toBeNull();
    expect(clearEditorBackup).not.toHaveBeenCalled();
  });
});

describe("retargetEditorsForRename", () => {
  it("repoints an open editor at the renamed file, updating its title", () => {
    const rec = openEditor("w", "/ws/w/a.ts");
    retargetEditorsForRename("/ws/w/a.ts", "/ws/w/b.ts");
    expect(rec.filePath).toBe("/ws/w/b.ts");
    expect(rec.title).toBe("b.ts");
  });

  it("repoints every editor nested under a renamed directory", () => {
    const inner = openEditor("w", "/ws/w/old-dir/nested/c.ts");
    const direct = openEditor("w", "/ws/w/old-dir/d.ts");
    retargetEditorsForRename("/ws/w/old-dir", "/ws/w/new-dir");
    expect(inner.filePath).toBe("/ws/w/new-dir/nested/c.ts");
    expect(direct.filePath).toBe("/ws/w/new-dir/d.ts");
  });

  it("leaves editors for unrelated paths untouched", () => {
    const rec = openEditor("w", "/ws/w/other.ts");
    retargetEditorsForRename("/ws/w/a.ts", "/ws/w/b.ts");
    expect(rec.filePath).toBe("/ws/w/other.ts");
  });

  it("does not retarget a diff-mode editor pinned to the old path", () => {
    const diffRec = openDiff("w", {
      filePath: "/ws/w/a.ts",
      providerId: "silo.git",
    });
    retargetEditorsForRename("/ws/w/a.ts", "/ws/w/b.ts");
    expect(diffRec.filePath).toBe("/ws/w/a.ts");
  });

  it("fires app:update-editor-title so the dockview tab picks up the new name", () => {
    const rec = openEditor("w", "/ws/w/a.ts");
    const seen: { editorId: string; title: string }[] = [];
    const listener = (e: Event) =>
      seen.push((e as CustomEvent<{ editorId: string; title: string }>).detail);
    window.addEventListener("app:update-editor-title", listener);
    try {
      retargetEditorsForRename("/ws/w/a.ts", "/ws/w/b.ts");
    } finally {
      window.removeEventListener("app:update-editor-title", listener);
    }
    expect(seen).toEqual([{ editorId: rec.id, title: "b.ts" }]);
  });

  it("spans workspaces", () => {
    store.workspaces = {
      ...store.workspaces,
      w2: (() => {
        const ws = { ...(store.workspaces.w as WorkspaceInternal) };
        ws.id = "w2";
        ws.folder = "/ws/w2";
        ws.editors = [];
        return ws;
      })(),
    };
    store.workspaceOrder = ["w", "w2"];
    const rec = openEditor("w2", "/ws/w2/a.ts");
    retargetEditorsForRename("/ws/w2/a.ts", "/ws/w2/b.ts");
    expect(rec.filePath).toBe("/ws/w2/b.ts");
  });
});

describe("side-panel visibility is per-workspace", () => {
  beforeEach(() => {
    store.sidePanelVisibility = {};
  });

  it("snapshots live visibility onto the workspace record", () => {
    store.sidePanelVisibility = { themes: false };
    savePanelStateToWorkspace("w");
    expect(store.workspaces.w.sidePanelVisibility).toEqual({ themes: false });
    // The snapshot is a copy — later live edits don't bleed into the record.
    store.sidePanelVisibility.git = false;
    expect(store.workspaces.w.sidePanelVisibility).toEqual({ themes: false });
  });

  it("restores visibility from the workspace record, defaulting to all-visible", () => {
    store.workspaces.w.sidePanelVisibility = { explorer: false };
    loadPanelStateFromWorkspace(store.workspaces.w);
    expect(store.sidePanelVisibility).toEqual({ explorer: false });

    // A workspace with no stored visibility hydrates as empty (all visible).
    const fresh = makeWorkspace("fresh");
    loadPanelStateFromWorkspace(fresh);
    expect(store.sidePanelVisibility).toEqual({});
  });

  it("isolates hidden panels between workspaces on switch", () => {
    store.workspaces = { w: makeWorkspace("w"), w2: makeWorkspace("w2") };
    store.workspaceOrder = ["w", "w2"];
    store.activeWorkspaceId = "w";

    // Hide a panel in w, then switch to w2 → w2 starts all-visible.
    store.sidePanelVisibility = { themes: false };
    activateWorkspace("w2");
    expect(store.sidePanelVisibility).toEqual({});

    // Hide a different panel in w2, switch back → w's hidden set returns and
    // w2's choice didn't leak into it.
    store.sidePanelVisibility = { git: false };
    activateWorkspace("w");
    expect(store.sidePanelVisibility).toEqual({ themes: false });

    // And w2 kept its own.
    activateWorkspace("w2");
    expect(store.sidePanelVisibility).toEqual({ git: false });
  });
});

describe("the two side-column layout modes are per-workspace", () => {
  beforeEach(() => {
    store.leftPanelCollapsed = false;
    store.rightPanelCollapsed = false;
    store.smallScreenActive = false;
    store.inactiveModeCollapsed = null;
  });

  afterEach(() => {
    store.smallScreenActive = false;
    store.inactiveModeCollapsed = null;
  });

  it("saves the live state as the normal-width layout on a normal-width window", () => {
    store.leftPanelCollapsed = true;
    savePanelStateToWorkspace("w");
    expect(store.workspaces.w.leftPanelCollapsed).toBe(true);
    expect(store.workspaces.w.rightPanelCollapsed).toBe(false);
    // Nothing recorded for small-screen mode yet — the key stays absent.
    expect(store.workspaces.w.smallScreenCollapsed).toBeUndefined();
  });

  it("saves the live state as the small-screen layout while narrow, leaving the other alone", () => {
    store.smallScreenActive = true;
    store.inactiveModeCollapsed = { left: false, right: false };
    store.leftPanelCollapsed = false;
    store.rightPanelCollapsed = true;

    savePanelStateToWorkspace("w");
    expect(store.workspaces.w.leftPanelCollapsed).toBe(false);
    expect(store.workspaces.w.rightPanelCollapsed).toBe(false);
    expect(store.workspaces.w.smallScreenCollapsed).toEqual({
      left: false,
      right: true,
    });
  });

  it("loads the live mode's layout and parks the other one", () => {
    store.workspaces.w.leftPanelCollapsed = true;
    store.workspaces.w.rightPanelCollapsed = false;
    store.workspaces.w.smallScreenCollapsed = { left: false, right: true };

    loadPanelStateFromWorkspace(store.workspaces.w);
    expect(store.leftPanelCollapsed).toBe(true); // normal-width layout
    expect(store.inactiveModeCollapsed).toEqual({ left: false, right: true });

    store.smallScreenActive = true;
    loadPanelStateFromWorkspace(store.workspaces.w);
    expect(store.leftPanelCollapsed).toBe(false); // small-screen layout
    expect(store.rightPanelCollapsed).toBe(true);
    expect(store.inactiveModeCollapsed).toEqual({ left: true, right: false });
  });

  it("starts a workspace that has never been narrow with both columns hidden", () => {
    store.smallScreenActive = true;
    loadPanelStateFromWorkspace(store.workspaces.w);
    expect(store.leftPanelCollapsed).toBe(true);
    expect(store.rightPanelCollapsed).toBe(true);
  });

  it("keeps each workspace's small-screen layout across a switch and back", () => {
    store.workspaces = { w: makeWorkspace("w"), w2: makeWorkspace("w2") };
    store.workspaceOrder = ["w", "w2"];
    store.activeWorkspaceId = "w";
    store.smallScreenActive = true;
    store.inactiveModeCollapsed = { left: false, right: false };
    store.leftPanelCollapsed = true;
    store.rightPanelCollapsed = true;

    // Open the left column on the narrow window, then go look at w2...
    store.leftPanelCollapsed = false;
    activateWorkspace("w2");
    expect(store.leftPanelCollapsed).toBe(true); // w2's own (fresh) layout

    // ...and back: w's narrow-window layout is exactly as it was left.
    activateWorkspace("w");
    expect(store.leftPanelCollapsed).toBe(false);
    expect(store.rightPanelCollapsed).toBe(true);
  });
});

describe("extra folders", () => {
  it("adds and removes a folder by exact path", () => {
    addExtraFolder("w", "/repo-b");
    expect(store.workspaces.w.extraFolders).toEqual(["/repo-b"]);
    removeExtraFolder("w", "/repo-b");
    expect(store.workspaces.w.extraFolders).toEqual([]);
  });

  it("does not add a duplicate of an already-open extra folder", () => {
    addExtraFolder("w", "/repo-b");
    addExtraFolder("w", "/repo-b");
    expect(store.workspaces.w.extraFolders).toEqual(["/repo-b"]);
  });

  it("does not add the workspace's own primary folder as an extra", () => {
    addExtraFolder("w", "/ws/w");
    expect(store.workspaces.w.extraFolders ?? []).toEqual([]);
  });

  // macOS realpaths /tmp, /var, /etc through a /private backing. A folder
  // opened with the /tmp spelling must still be found and removed when a
  // caller (e.g. git worktree removal) later hands back the /private/tmp
  // spelling — see the WorktreeManager verification finding this regression-
  // tests: `ctx.workspaces.removeFolder` was previously a raw string
  // comparison, so it silently no-op'd on this exact mismatch, leaving a
  // stale folder open after its worktree was deleted on disk.
  it("treats /private/tmp and /tmp spellings of the same path as identical", () => {
    addExtraFolder("w", "/tmp/wt1");
    expect(store.workspaces.w.extraFolders).toEqual(["/tmp/wt1"]);

    removeExtraFolder("w", "/private/tmp/wt1");
    expect(store.workspaces.w.extraFolders).toEqual([]);
  });

  it("treats a /private-spelled primary folder as already open", () => {
    store.workspaces.w.folder = "/private/tmp/proj";
    addExtraFolder("w", "/tmp/proj");
    expect(store.workspaces.w.extraFolders ?? []).toEqual([]);
  });

  it("does not fold unrelated /private paths (e.g. /privateer)", () => {
    addExtraFolder("w", "/privateer/tmp/x");
    removeExtraFolder("w", "/tmp/x");
    // The unrelated folder should still be there — only the real /private
    // prefix is folded, not any path that merely starts with those letters.
    expect(store.workspaces.w.extraFolders).toEqual(["/privateer/tmp/x"]);
  });

  it("no-ops for an unknown workspace", () => {
    expect(() => addExtraFolder("nope", "/x")).not.toThrow();
    expect(() => removeExtraFolder("nope", "/x")).not.toThrow();
  });
});

describe("global side panel layout (ADR 0035)", () => {
  beforeEach(() => {
    store.sidePanelLocations = {};
    store.sidePanelVisibility = {};
    store.activeSidePanelTabs = {};
    store.leftPanelCollapsed = false;
    store.rightPanelCollapsed = false;
    store.globalPanelLayoutEnabled = false;
    store.globalActiveTabEnabled = false;
    store.globalPanelLayout = structuredClone(DEFAULT_GLOBAL_PANEL_LAYOUT);
    store.globalActiveSidePanelTabs = {};
  });

  it("enabling seeds the global layout from what's currently live", () => {
    store.sidePanelLocations = { explorer: "left" };
    store.sidePanelVisibility = { themes: false };
    store.leftPanelCollapsed = true;

    setGlobalPanelLayoutEnabled(true);

    expect(store.globalPanelLayout.sidePanelLocations).toEqual({
      explorer: "left",
    });
    expect(store.globalPanelLayout.sidePanelVisibility).toEqual({
      themes: false,
    });
    expect(store.globalPanelLayout.leftPanelCollapsed).toBe(true);
  });

  it("disabling restores the active workspace's own frozen arrangement, unaffected by edits made while global was on", () => {
    store.sidePanelLocations = { explorer: "left" };
    savePanelStateToWorkspace("w"); // freeze w's arrangement before enabling

    setGlobalPanelLayoutEnabled(true);
    store.sidePanelLocations = { explorer: "right" }; // live edit while shared

    setGlobalPanelLayoutEnabled(false);
    expect(store.sidePanelLocations).toEqual({ explorer: "left" });
    expect(store.workspaces.w.sidePanelLocations).toEqual({
      explorer: "left",
    });
  });

  it("disabling seeds a workspace created while the flag was on from the global record", () => {
    setGlobalPanelLayoutEnabled(true);
    store.sidePanelLocations = { explorer: "right" };

    // A workspace created while global mode is on has no arrangement yet.
    store.workspaces.w2 = makeWorkspace("w2");
    store.workspaceOrder.push("w2");
    expect(store.workspaces.w2.sidePanelLocations).toBeUndefined();

    setGlobalPanelLayoutEnabled(false);

    expect(store.workspaces.w2.sidePanelLocations).toEqual({
      explorer: "right",
    });
  });

  it("shares live arrangement edits across every workspace while enabled", () => {
    store.workspaces = { w: makeWorkspace("w"), w2: makeWorkspace("w2") };
    store.workspaceOrder = ["w", "w2"];
    store.activeWorkspaceId = "w";
    store.workspaces.w.sidePanelLocations = { explorer: "left" };
    store.workspaces.w2.sidePanelLocations = { explorer: "right" };

    setGlobalPanelLayoutEnabled(true);
    store.sidePanelLocations = { explorer: "right" }; // a live edit

    activateWorkspace("w2");
    // w2 shows the shared edit, not its own (now-frozen, unused) arrangement.
    expect(store.sidePanelLocations).toEqual({ explorer: "right" });
  });

  it("the active-tab sub-setting only takes effect while the main flag is on, and keeps its stored value when the main flag is disabled", () => {
    store.activeSidePanelTabs = { left: "explorer" };
    setGlobalPanelLayoutEnabled(true);
    setGlobalActiveTabEnabled(true);
    expect(store.globalActiveSidePanelTabs).toEqual({ left: "explorer" });

    setGlobalPanelLayoutEnabled(false);
    expect(store.globalActiveTabEnabled).toBe(true); // preserved, just inert

    setGlobalPanelLayoutEnabled(true);
    expect(store.globalActiveTabEnabled).toBe(true); // re-takes effect, no re-opt-in
  });

  it("shares activeSidePanelTabs across workspaces only when its sub-setting is also on", () => {
    store.workspaces = { w: makeWorkspace("w"), w2: makeWorkspace("w2") };
    store.workspaceOrder = ["w", "w2"];
    store.activeWorkspaceId = "w";
    store.workspaces.w.activeSidePanelTabs = { left: "explorer" };
    store.workspaces.w2.activeSidePanelTabs = { left: "search" };

    setGlobalPanelLayoutEnabled(true);
    // Not shared yet — each workspace keeps its own active tab.
    loadPanelStateFromWorkspace(store.workspaces.w);
    expect(store.activeSidePanelTabs).toEqual({ left: "explorer" });
    loadPanelStateFromWorkspace(store.workspaces.w2);
    expect(store.activeSidePanelTabs).toEqual({ left: "search" });

    setGlobalActiveTabEnabled(true); // seeds from what's currently live (w2's)
    loadPanelStateFromWorkspace(store.workspaces.w);
    expect(store.activeSidePanelTabs).toEqual({ left: "search" });
  });

  it("activateWorkspace round-trips per-workspace active tabs while layout is shared but the sub-setting is off", () => {
    store.workspaces = { w: makeWorkspace("w"), w2: makeWorkspace("w2") };
    store.workspaceOrder = ["w", "w2"];
    store.activeWorkspaceId = "w";
    store.activeSidePanelTabs = { left: "explorer" };
    store.workspaces.w.activeSidePanelTabs = { left: "explorer" };
    store.workspaces.w2.activeSidePanelTabs = { left: "search" };

    setGlobalPanelLayoutEnabled(true);
    // globalActiveTabEnabled stays false — tabs must stay per-workspace.

    activateWorkspace("w2");
    expect(store.activeSidePanelTabs).toEqual({ left: "search" });
    expect(store.workspaces.w.activeSidePanelTabs).toEqual({
      left: "explorer",
    });

    store.activeSidePanelTabs = { left: "git" };
    activateWorkspace("w");
    expect(store.activeSidePanelTabs).toEqual({ left: "explorer" });
    expect(store.workspaces.w2.activeSidePanelTabs).toEqual({ left: "git" });
  });

  describe("hasSavedGlobalPanelLayout", () => {
    it("is false for a fresh/default record", () => {
      expect(hasSavedGlobalPanelLayout()).toBe(false);
    });

    it("is true once a previous enable/disable cycle has left something behind", () => {
      store.sidePanelLocations = { explorer: "left" };
      setGlobalPanelLayoutEnabled(true);
      setGlobalPanelLayoutEnabled(false);
      expect(hasSavedGlobalPanelLayout()).toBe(true);
    });
  });

  describe("enableGlobalPanelLayout", () => {
    it('"current" captures fresh from live, discarding any previously-saved layout', () => {
      store.sidePanelLocations = { explorer: "left" };
      setGlobalPanelLayoutEnabled(true);
      setGlobalPanelLayoutEnabled(false); // saves { explorer: "left" } as the shared record

      store.sidePanelLocations = { explorer: "right" }; // a different arrangement now
      enableGlobalPanelLayout("current");
      expect(store.globalPanelLayout.sidePanelLocations).toEqual({
        explorer: "right",
      });
      expect(store.sidePanelLocations).toEqual({ explorer: "right" });
    });

    it('"previous" applies the saved record to live without re-capturing it', () => {
      store.sidePanelLocations = { explorer: "left" };
      setGlobalPanelLayoutEnabled(true);
      setGlobalPanelLayoutEnabled(false); // saves { explorer: "left" }

      store.sidePanelLocations = { explorer: "right" }; // live has since changed
      enableGlobalPanelLayout("previous");
      expect(store.sidePanelLocations).toEqual({ explorer: "left" });
      expect(store.globalPanelLayout.sidePanelLocations).toEqual({
        explorer: "left",
      });
    });

    it('"previous" also restores the saved active-tab map when the sub-setting is on', () => {
      store.sidePanelLocations = { explorer: "left" };
      store.activeSidePanelTabs = { left: "explorer" };
      setGlobalActiveTabEnabled(true);
      setGlobalPanelLayoutEnabled(true);
      setGlobalPanelLayoutEnabled(false); // saves globalActiveSidePanelTabs too

      store.activeSidePanelTabs = { left: "search" }; // live has since changed
      enableGlobalPanelLayout("previous");
      expect(store.activeSidePanelTabs).toEqual({ left: "explorer" });
    });

    it("is a no-op if already enabled", () => {
      setGlobalPanelLayoutEnabled(true);
      store.sidePanelLocations = { explorer: "left" };
      enableGlobalPanelLayout("current"); // should not re-seed while already on
      expect(store.globalPanelLayout.sidePanelLocations).toEqual({});
    });
  });
});

describe("editor settings override (per-tab word wrap / minimap)", () => {
  it("returns {} when no override has been set", () => {
    expect(getEditorSettingOverride("w", "ed1")).toEqual({});
  });

  it("stores and reads back a single key", () => {
    setEditorSettingOverride("w", "ed1", "wordWrap", true);
    expect(getEditorSettingOverride("w", "ed1")).toEqual({ wordWrap: true });
  });

  it("merges a second key into the same editor's override", () => {
    setEditorSettingOverride("w", "ed1", "wordWrap", true);
    setEditorSettingOverride("w", "ed1", "minimap", true);
    expect(getEditorSettingOverride("w", "ed1")).toEqual({
      wordWrap: true,
      minimap: true,
    });
  });

  it("keeps overrides independent per editor id", () => {
    setEditorSettingOverride("w", "ed1", "wordWrap", true);
    expect(getEditorSettingOverride("w", "ed2")).toEqual({});
  });

  it("is a no-op for a workspace id that doesn't exist", () => {
    setEditorSettingOverride("missing", "ed1", "wordWrap", true);
    expect(getEditorSettingOverride("missing", "ed1")).toEqual({});
  });
});

describe("shared side panel widths", () => {
  beforeEach(() => {
    store.workspaces = { w: makeWorkspace("w"), other: makeWorkspace("other") };
    store.workspaceOrder = ["w", "other"];
    store.activeWorkspaceId = "w";
    store.globalPanelLayoutEnabled = false;
    store.sharedColumnWidthsEnabled = true;
    store.columnWidths = {
      normal: { left: 260, right: 340 },
      smallScreen: { left: 220, right: 260 },
    };
  });

  it("is on by default — how widths have always behaved", () => {
    expect(DEFAULT_SHARED_COLUMN_WIDTHS).toBe(true);
  });

  it("ignores a set to the value it already has", () => {
    setSharedColumnWidthsEnabled(true);
    expect(store.workspaces.w.columnWidths).toBeUndefined();
  });

  // Turning it off must not move anything on screen: the workspace that is
  // showing takes ownership of the widths that are already showing.
  it("gives the active workspace the live widths when turned off", () => {
    store.columnWidths.normal = { left: 300, right: 900 };
    setSharedColumnWidthsEnabled(false);
    expect(store.sharedColumnWidthsEnabled).toBe(false);
    expect(store.workspaces.w.columnWidths?.normal).toEqual({
      left: 300,
      right: 900,
    });
    expect(store.columnWidths.normal).toEqual({ left: 300, right: 900 });
  });

  it("lets two workspaces hold different widths", () => {
    setSharedColumnWidthsEnabled(false);
    store.columnWidths.normal = { left: 300, right: 900 };
    savePanelStateToWorkspace("w");

    store.activeWorkspaceId = "other";
    store.columnWidths.normal = { left: 260, right: 340 };
    savePanelStateToWorkspace("other");

    expect(store.workspaces.w.columnWidths?.normal).toEqual({
      left: 300,
      right: 900,
    });
    expect(store.workspaces.other.columnWidths?.normal).toEqual({
      left: 260,
      right: 340,
    });
  });

  // Mirrors ADR 0035: turning sharing back on freezes each workspace's own
  // widths rather than discarding them, so turning it off again restores them.
  it("freezes per-workspace widths when turned back on", () => {
    setSharedColumnWidthsEnabled(false);
    store.columnWidths.normal = { left: 300, right: 900 };
    savePanelStateToWorkspace("w");

    setSharedColumnWidthsEnabled(true);
    store.columnWidths.normal = { left: 260, right: 340 };
    savePanelStateToWorkspace("w");
    expect(store.workspaces.w.columnWidths?.normal).toEqual({
      left: 300,
      right: 900,
    });
  });

  // Sharing the arrangement while sizing each dock per workspace is the whole
  // point of two switches, so the global-layout save path must still carry
  // widths through — it drops every other arrangement field on purpose.
  it("is independent of the global panel layout flag", () => {
    store.globalPanelLayoutEnabled = true;
    setSharedColumnWidthsEnabled(false);
    expect(store.globalPanelLayoutEnabled).toBe(true);
    expect(store.sharedColumnWidthsEnabled).toBe(false);
    expect(store.workspaces.w.columnWidths?.normal).toEqual({
      left: 260,
      right: 340,
    });

    store.columnWidths.normal = { left: 300, right: 900 };
    savePanelStateToWorkspace("w");
    expect(store.workspaces.w.columnWidths?.normal).toEqual({
      left: 300,
      right: 900,
    });
  });
});

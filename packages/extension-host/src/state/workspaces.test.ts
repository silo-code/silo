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
  loadPanelStateFromWorkspace,
  activateWorkspace,
  setEditorSettingOverride,
  getEditorSettingOverride,
  addExtraFolder,
  removeExtraFolder,
} from "./workspaces";
import { clearEditorBackup } from "./editor-backups";

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

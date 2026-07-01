import { describe, it, expect, beforeEach, vi } from "vitest";
import type { WorkspaceInternal } from "./types";

// removeEditor fire-and-forgets a backup clear; mock the backup module so the
// test asserts the call without touching the Tauri fs boundary.
vi.mock("./editor-backups", () => ({
  clearEditorBackup: vi.fn(() => Promise.resolve()),
}));

import { store } from "./store";
import {
  openEditor,
  removeEditor,
  savePanelStateToWorkspace,
  loadPanelStateFromWorkspace,
  activateWorkspace,
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

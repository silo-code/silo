import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Workspace } from "@silo-code/sdk";

// removeEditor fire-and-forgets a backup clear; mock the backup module so the
// test asserts the call without touching the Tauri fs boundary.
vi.mock("./editor-backups", () => ({
  clearEditorBackup: vi.fn(() => Promise.resolve()),
}));

import { store } from "./store";
import { openEditor, removeEditor } from "./workspaces";
import { clearEditorBackup } from "./editor-backups";

function makeWorkspace(id: string): Workspace {
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

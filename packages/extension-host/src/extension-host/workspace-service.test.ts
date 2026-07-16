import { describe, it, expect, beforeEach, vi } from "vitest";

const { deleteTerminal } = vi.hoisted(() => ({
  deleteTerminal: vi.fn(() => Promise.resolve()),
}));
vi.mock("../services/tauri-terminal-client", () => ({
  tauriTerminalClient: { deleteTerminal },
}));

import { store } from "../state/store";
import type { WorkspaceInternal } from "../state/types";
import { getWorkspaceService } from "./workspace-service";

const svc = getWorkspaceService();

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
  deleteTerminal.mockReset().mockResolvedValue(undefined);
  const a = makeWorkspace("a");
  a.terminals = [
    { id: "t1", sessionId: "sess-1", kind: "shell", title: "Terminal" },
    { id: "t2", sessionId: "", kind: "shell", title: "Terminal" },
  ];
  const b = makeWorkspace("b");
  store.workspaces = { a, b };
  store.workspaceOrder = ["a", "b"];
  store.panelOrder = ["a", "b"];
  store.activeWorkspaceId = "a";
  store.groups = {};
});

describe("WorkspaceService.delete", () => {
  it("reaps live PTY sessions before removing the workspace", () => {
    svc.delete("a");
    expect(deleteTerminal).toHaveBeenCalledWith("sess-1");
    expect(deleteTerminal).toHaveBeenCalledTimes(1);
    expect(store.workspaces.a).toBeUndefined();
    expect(store.workspaceOrder).toEqual(["b"]);
    expect(store.activeWorkspaceId).toBe("b");
  });

  it("does not touch terminals belonging to other workspaces", () => {
    store.workspaces.b!.terminals = [
      { id: "tb", sessionId: "sess-b", kind: "shell", title: "Terminal" },
    ];
    svc.delete("a");
    expect(deleteTerminal).toHaveBeenCalledWith("sess-1");
    expect(deleteTerminal).not.toHaveBeenCalledWith("sess-b");
    expect(store.workspaces.b!.terminals).toHaveLength(1);
  });

  it("removes a workspace with only unspawned terminals without a kill call", () => {
    store.workspaces.a!.terminals = [
      { id: "t-unspawned", sessionId: "", kind: "shell", title: "Terminal" },
    ];
    svc.delete("a");
    expect(deleteTerminal).not.toHaveBeenCalled();
    expect(store.workspaces.a).toBeUndefined();
  });

  it("is a no-op for an unknown workspace id", () => {
    svc.delete("nope");
    expect(deleteTerminal).not.toHaveBeenCalled();
    expect(Object.keys(store.workspaces)).toEqual(["a", "b"]);
  });
});

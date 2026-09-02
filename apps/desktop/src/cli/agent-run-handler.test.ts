import { describe, it, expect, beforeEach, vi } from "vitest";
import { store } from "@silo-code/extension-host";
import type { WorkspaceInternal } from "@silo-code/extension-host/internal";

const { launchAgentProfile } = vi.hoisted(() => ({
  launchAgentProfile: vi.fn(() => ({ id: "term-1" })),
}));

vi.mock("@silo-code/extension-host/internal", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@silo-code/extension-host/internal")
    >();
  return { ...actual, launchAgentProfile };
});

const { addAgentProfile } = await import("@silo-code/extension-host/internal");
const { findWorkspaceContaining, folderContains } = await import(
  "./open-handler"
);
const { applyCliAgentRun } = await import("./agent-run-handler");

function makeWorkspace(
  id: string,
  folder: string,
  extra?: string[],
): WorkspaceInternal {
  return {
    id,
    name: id,
    folder,
    extraFolders: extra,
    createdAt: "",
    lastOpenedAt: "",
    terminals: [],
    editors: [],
    dockLayout: null,
    previewEditorId: null,
  };
}

beforeEach(() => {
  store.workspaces = {};
  store.workspaceOrder = [];
  store.activeWorkspaceId = null;
  store.agentProfiles = [];
  launchAgentProfile.mockClear();
});

describe("folderContains", () => {
  it("matches at a path-segment boundary only", () => {
    expect(folderContains("/a/b", "/a/b")).toBe(true);
    expect(folderContains("/a/b", "/a/b/c")).toBe(true);
    expect(folderContains("/a/b", "/a/bc")).toBe(false);
    expect(folderContains("/a/b", "/a")).toBe(false);
  });

  it("treats root as containing everything", () => {
    expect(folderContains("/", "/anything/here")).toBe(true);
  });
});

describe("findWorkspaceContaining", () => {
  it("finds the workspace whose primary folder contains the cwd", () => {
    const ws = { a: makeWorkspace("a", "/proj") };
    expect(findWorkspaceContaining(ws, "/proj/src/deep")?.id).toBe("a");
  });

  it("matches an extra folder", () => {
    const ws = { a: makeWorkspace("a", "/proj", ["/other"]) };
    expect(findWorkspaceContaining(ws, "/other/pkg")?.id).toBe("a");
  });

  it("prefers the deepest (longest) match when workspaces nest", () => {
    const ws = {
      a: makeWorkspace("a", "/a"),
      b: makeWorkspace("b", "/a/b"),
    };
    expect(findWorkspaceContaining(ws, "/a/b/c")?.id).toBe("b");
    expect(findWorkspaceContaining(ws, "/a/x")?.id).toBe("a");
  });

  it("does not match a sibling directory sharing a prefix", () => {
    const ws = { a: makeWorkspace("a", "/a/b") };
    expect(findWorkspaceContaining(ws, "/a/bc")).toBeUndefined();
  });

  it("returns undefined when no open workspace contains the cwd", () => {
    const ws = { a: makeWorkspace("a", "/proj") };
    expect(findWorkspaceContaining(ws, "/elsewhere")).toBeUndefined();
  });
});

describe("applyCliAgentRun — nothing to launch", () => {
  it("creates nothing when --profile names an unknown id", () => {
    addAgentProfile({ id: "real", label: "Real", command: "claude" });
    applyCliAgentRun({ cwd: "/proj", profileId: "ghost" });

    expect(Object.keys(store.workspaces)).toHaveLength(0);
    expect(store.activeWorkspaceId).toBeNull();
  });

  it("creates nothing on a bare run with no profiles defined", () => {
    applyCliAgentRun({ cwd: "/proj" });

    expect(Object.keys(store.workspaces)).toHaveLength(0);
    expect(store.activeWorkspaceId).toBeNull();
    expect(launchAgentProfile).not.toHaveBeenCalled();
  });
});

describe("applyCliAgentRun — workspace resolution", () => {
  it("launches into the existing workspace that contains the cwd, at the cwd", () => {
    addAgentProfile({ id: "p", label: "P", command: "claude" });
    store.workspaces = { w: makeWorkspace("w", "/proj") };
    store.workspaceOrder = ["w"];

    applyCliAgentRun({ cwd: "/proj/src", profileId: "p" });

    expect(Object.keys(store.workspaces)).toEqual(["w"]);
    expect(launchAgentProfile).toHaveBeenCalledWith({
      profileId: "p",
      workspaceId: "w",
      cwd: "/proj/src",
    });
    expect(store.activeWorkspaceId).toBe("w");
  });

  it("creates and activates a workspace rooted at the cwd when none contains it", () => {
    addAgentProfile({ id: "p", label: "P", command: "claude", default: true });

    applyCliAgentRun({ cwd: "/fresh/repo" });

    const all = Object.values(store.workspaces);
    expect(all).toHaveLength(1);
    expect(all[0].folder).toBe("/fresh/repo");
    expect(store.activeWorkspaceId).toBe(all[0].id);
    expect(launchAgentProfile).toHaveBeenCalledWith(
      expect.objectContaining({ profileId: "p", cwd: "/fresh/repo" }),
    );
  });
});

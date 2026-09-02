import { describe, it, expect, beforeEach, vi } from "vitest";
import { store } from "@silo-code/extension-host";
import type { WorkspaceInternal } from "@silo-code/extension-host/internal";

const { launchAgentProfile } = vi.hoisted(() => ({
  launchAgentProfile: vi.fn(() => ({ id: "term-1" })),
}));

vi.mock("@silo-code/extension-host/internal", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@silo-code/extension-host/internal")>();
  return { ...actual, launchAgentProfile };
});

const { addAgentProfile } = await import("@silo-code/extension-host/internal");
const { findWorkspaceContaining, folderContains } =
  await import("./open-handler");
const { applyCliAgentRun, applyCliAgentUsage } =
  await import("./agent-run-handler");

function makeWorkspace(
  id: string,
  folder: string,
  extra?: string[],
  closedAt?: string,
): WorkspaceInternal {
  return {
    id,
    name: id,
    folder,
    extraFolders: extra,
    closedAt,
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

  it("returns undefined when no workspace contains the cwd", () => {
    const ws = { a: makeWorkspace("a", "/proj") };
    expect(findWorkspaceContaining(ws, "/elsewhere")).toBeUndefined();
  });

  // ADR 0047's tie-breaks, in order, each isolated to one rung.
  it("prefers an open workspace over a soft-closed one at the same root", () => {
    const ws = {
      closed: makeWorkspace(
        "closed",
        "/proj",
        undefined,
        "2026-09-01T00:00:00Z",
      ),
      open: makeWorkspace("open", "/proj"),
    };
    expect(findWorkspaceContaining(ws, "/proj/src")?.id).toBe("open");
  });

  it("still matches a soft-closed workspace when it is the only container", () => {
    const ws = {
      closed: makeWorkspace(
        "closed",
        "/proj",
        undefined,
        "2026-09-01T00:00:00Z",
      ),
    };
    expect(findWorkspaceContaining(ws, "/proj/src")?.id).toBe("closed");
  });

  it("prefers a primary-folder match over an extraFolders match", () => {
    const ws = {
      extra: makeWorkspace("extra", "/other", ["/proj"]),
      primary: makeWorkspace("primary", "/proj"),
    };
    expect(findWorkspaceContaining(ws, "/proj/src")?.id).toBe("primary");
  });

  it("prefers the active workspace when everything else ties", () => {
    const ws = {
      a: makeWorkspace("a", "/proj"),
      b: makeWorkspace("b", "/proj"),
    };
    expect(findWorkspaceContaining(ws, "/proj/src", "b")?.id).toBe("b");
  });

  it("keeps depth ahead of the active workspace", () => {
    const ws = {
      shallow: makeWorkspace("shallow", "/a"),
      deep: makeWorkspace("deep", "/a/b"),
    };
    expect(findWorkspaceContaining(ws, "/a/b/c", "shallow")?.id).toBe("deep");
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

  it("creates nothing when the cwd is inside no workspace (ADR 0047)", () => {
    // Only `silo <dir>` may create a workspace. A run from an unrelated
    // directory is a mistake, not a request for a new workspace.
    addAgentProfile({ id: "p", label: "P", command: "claude", default: true });

    applyCliAgentRun({ cwd: "/fresh/repo" });

    expect(Object.keys(store.workspaces)).toHaveLength(0);
    expect(store.activeWorkspaceId).toBeNull();
    expect(launchAgentProfile).not.toHaveBeenCalled();
  });

  it("reopens and launches into a soft-closed workspace that contains the cwd", () => {
    addAgentProfile({ id: "p", label: "P", command: "claude", default: true });
    store.workspaces = {
      w: makeWorkspace("w", "/proj", undefined, "2026-09-01T00:00:00Z"),
    };
    store.workspaceOrder = ["w"];

    applyCliAgentRun({ cwd: "/proj/src" });

    expect(launchAgentProfile).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "w" }),
    );
    expect(store.activeWorkspaceId).toBe("w");
    expect(store.workspaces.w.closedAt).toBeFalsy();
  });
});

describe("applyCliAgentRun — an explicit --ws target", () => {
  beforeEach(() => {
    addAgentProfile({ id: "p", label: "P", command: "claude", default: true });
    store.workspaces = {
      a: makeWorkspace("a", "/proj-a"),
      b: makeWorkspace("b", "/proj-b", ["/extra-b"]),
    };
    store.workspaceOrder = ["a", "b"];
    store.activeWorkspaceId = "a";
  });

  it("targets by folder path, overriding the cwd's own workspace", () => {
    applyCliAgentRun({ cwd: "/proj-a/src", ws: "/proj-b" });

    expect(launchAgentProfile).toHaveBeenCalledWith({
      profileId: "p",
      workspaceId: "b",
      // Not /proj-a/src: a cwd outside the named workspace is irrelevant to it,
      // so the agent starts at the root the caller named.
      cwd: "/proj-b",
    });
    expect(store.activeWorkspaceId).toBe("b");
  });

  it("keeps the shell's cwd when it is inside the named workspace", () => {
    applyCliAgentRun({ cwd: "/proj-b/packages/sdk", ws: "/proj-b" });

    expect(launchAgentProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: "b",
        cwd: "/proj-b/packages/sdk",
      }),
    );
  });

  it("starts at the named extra folder, not the primary one", () => {
    applyCliAgentRun({ cwd: "/proj-a", ws: "/extra-b" });

    expect(launchAgentProfile).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "b", cwd: "/extra-b" }),
    );
  });

  it("starts at the primary folder when targeted by id from outside", () => {
    applyCliAgentRun({ cwd: "/proj-a", ws: "b" });

    expect(launchAgentProfile).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: "b", cwd: "/proj-b" }),
    );
  });

  it("is an error, not a fallback, when nothing matches", () => {
    applyCliAgentRun({ cwd: "/proj-a/src", ws: "/no/such/folder" });

    expect(launchAgentProfile).not.toHaveBeenCalled();
    expect(Object.keys(store.workspaces)).toEqual(["a", "b"]);
    expect(store.activeWorkspaceId).toBe("a");
  });

  it("does not match a containing folder — --ws is exact", () => {
    // Containment is the *inference* rule; an explicit target names a root.
    applyCliAgentRun({ cwd: "/proj-a", ws: "/proj-b/packages/sdk" });
    expect(launchAgentProfile).not.toHaveBeenCalled();
  });
});

describe("applyCliAgentUsage", () => {
  it("creates nothing and launches nothing", () => {
    addAgentProfile({ id: "p", label: "P", command: "claude", default: true });

    applyCliAgentUsage("list");
    applyCliAgentUsage(undefined);

    expect(Object.keys(store.workspaces)).toHaveLength(0);
    expect(launchAgentProfile).not.toHaveBeenCalled();
  });
});

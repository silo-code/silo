import { describe, it, expect, beforeEach, vi } from "vitest";
import { store } from "@silo-code/extension-host";
import type { WorkspaceInternal } from "@silo-code/extension-host/internal";
import {
  applyCliOpen,
  applyCliInstall,
  applyCliUninstall,
  findWorkspaceByFolder,
  findWorkspaceContaining,
  folderContains,
  normalizeFolder,
  dirname,
  basename,
} from "./open-handler";

// ---- extension manager mock -------------------------------------------------

const installFromFolderMock = vi.fn(async () => {});
const uninstallMock = vi.fn(async () => {});

vi.mock("@silo-code/extension-host", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@silo-code/extension-host")>();
  return {
    ...actual,
    getExtensionManager: () => ({
      installFromFolder: installFromFolderMock,
      uninstall: uninstallMock,
    }),
  };
});

// Drives the CLI open logic against the real (in-memory) workspace store —
// the unit layer (jsdom, Tauri boundary mocked), same style as the host's
// editor-service tests.

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
  installFromFolderMock.mockClear();
  uninstallMock.mockClear();
});

describe("path helpers", () => {
  it("normalizes trailing slashes but keeps root", () => {
    expect(normalizeFolder("/a/b/")).toBe("/a/b");
    expect(normalizeFolder("/a/b///")).toBe("/a/b");
    expect(normalizeFolder("/a/b")).toBe("/a/b");
    expect(normalizeFolder("/")).toBe("/");
  });

  it("derives dirname and basename of an absolute path", () => {
    expect(dirname("/Users/me/proj/readme.md")).toBe("/Users/me/proj");
    expect(basename("/Users/me/proj/readme.md")).toBe("readme.md");
    expect(basename("/Users/me/proj/")).toBe("proj");
    expect(dirname("/top")).toBe("/");
  });
});

describe("findWorkspaceByFolder", () => {
  it("matches the primary folder, normalizing trailing slashes", () => {
    const ws = makeWorkspace("a", "/code/foo");
    const found = findWorkspaceByFolder({ a: ws }, "/code/foo/");
    expect(found?.id).toBe("a");
  });

  it("matches an extra folder", () => {
    const ws = makeWorkspace("a", "/code/foo", ["/code/bar"]);
    expect(findWorkspaceByFolder({ a: ws }, "/code/bar")?.id).toBe("a");
  });

  it("returns undefined when nothing matches", () => {
    const ws = makeWorkspace("a", "/code/foo");
    expect(findWorkspaceByFolder({ a: ws }, "/code/other")).toBeUndefined();
  });
});

// `folderContains` and `findWorkspaceContaining` are the *containment* rules —
// which workspace a shell's cwd is inside. `silo agent run` is their consumer
// (RFC 0034's `agent.run` handler), but they are owned here, alongside the
// exact-match `findWorkspaceByFolder` they are so easily confused with.

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

describe("applyCliOpen — directory", () => {
  it("activates an existing workspace without creating a new one", () => {
    store.workspaces = { a: makeWorkspace("a", "/code/foo") };
    store.workspaceOrder = ["a"];

    applyCliOpen({ path: "/code/foo", kind: "dir" });

    expect(Object.keys(store.workspaces)).toEqual(["a"]);
    expect(store.activeWorkspaceId).toBe("a");
  });

  it("creates and activates a workspace when none matches", () => {
    applyCliOpen({ path: "/code/new-proj", kind: "dir" });

    const all = Object.values(store.workspaces);
    expect(all).toHaveLength(1);
    expect(all[0].folder).toBe("/code/new-proj");
    expect(all[0].name).toBe("new-proj");
    expect(store.activeWorkspaceId).toBe(all[0].id);
  });
});

describe("applyCliOpen — file", () => {
  it("opens the file in the active workspace, creating nothing", () => {
    store.workspaces = { a: makeWorkspace("a", "/code/foo") };
    store.workspaceOrder = ["a"];
    store.activeWorkspaceId = "a";

    applyCliOpen({ path: "/code/foo/readme.md", kind: "file" });

    expect(Object.keys(store.workspaces)).toEqual(["a"]);
    const editors = store.workspaces.a.editors;
    expect(editors.some((e) => e.filePath === "/code/foo/readme.md")).toBe(
      true,
    );
  });

  it("creates a parent-folder workspace when none is active", () => {
    applyCliOpen({ path: "/code/loose/notes.txt", kind: "file" });

    const all = Object.values(store.workspaces);
    expect(all).toHaveLength(1);
    expect(all[0].folder).toBe("/code/loose");
    expect(store.activeWorkspaceId).toBe(all[0].id);
    expect(
      all[0].editors.some((e) => e.filePath === "/code/loose/notes.txt"),
    ).toBe(true);
  });
});

describe("applyCliOpen — missing", () => {
  it("is a no-op", () => {
    applyCliOpen({ path: "/no/such/thing", kind: "missing" });
    expect(Object.keys(store.workspaces)).toHaveLength(0);
    expect(store.activeWorkspaceId).toBeNull();
  });
});

describe("applyCliInstall", () => {
  it("delegates to getExtensionManager().installFromFolder", async () => {
    await applyCliInstall("/tmp/silo-ext/dave.clock");
    expect(installFromFolderMock).toHaveBeenCalledOnce();
    expect(installFromFolderMock).toHaveBeenCalledWith(
      "/tmp/silo-ext/dave.clock",
    );
  });

  it("propagates errors from installFromFolder", async () => {
    installFromFolderMock.mockRejectedValueOnce(new Error("bad manifest"));
    await expect(applyCliInstall("/bad/path")).rejects.toThrow("bad manifest");
  });
});

describe("applyCliUninstall", () => {
  it("delegates to getExtensionManager().uninstall", async () => {
    await applyCliUninstall("dave.clock");
    expect(uninstallMock).toHaveBeenCalledOnce();
    expect(uninstallMock).toHaveBeenCalledWith("dave.clock");
  });

  it("propagates errors from uninstall", async () => {
    uninstallMock.mockRejectedValueOnce(new Error("not found"));
    await expect(applyCliUninstall("no.such.ext")).rejects.toThrow("not found");
  });
});

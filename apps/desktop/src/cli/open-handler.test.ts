import { describe, it, expect, beforeEach, vi } from "vitest";
import { store } from "@silo-code/extension-host";
import type { WorkspaceInternal } from "@silo-code/extension-host/internal";
import {
  applyCliOpen,
  applyCliInstall,
  applyCliUninstall,
  findWorkspaceByFolder,
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

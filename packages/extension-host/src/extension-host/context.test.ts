// Integration test for createContext's filesystem/process scoping: the scope's
// roots are derived live from the active workspace, builtins (trusted) are
// unscoped, and runtime extensions (untrusted) are confined to the workspace.
// The scoped-service rules themselves live in security/*.test.ts; here we pin the
// wiring — trust flag + live workspace roots. The Tauri fs boundary is mocked so
// an *allowed* call resolves instead of hitting a missing backend.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NoWorkspaceError, PathDeniedError } from "@silo-code/sdk";

const { readTextMock, writeTextMock, createDirMock, deleteMock } = vi.hoisted(
  () => ({
    readTextMock: vi.fn(async () => "file-contents"),
    writeTextMock: vi.fn(async () => {}),
    createDirMock: vi.fn(async () => {}),
    deleteMock: vi.fn(async () => {}),
  }),
);
vi.mock("../services/user-config", () => ({
  userConfigDir: async () => "/cfg",
}));
vi.mock("../services/tauri-fs", () => ({
  fsReadText: readTextMock,
  fsReadBytes: vi.fn(),
  fsWriteText: writeTextMock,
  fsWriteBytes: vi.fn(),
  fsCreateDir: createDirMock,
  fsPathExists: vi.fn(),
  fsStat: vi.fn(),
  fsRename: vi.fn(),
  fsDelete: deleteMock,
  fsReveal: vi.fn(),
  fsReadDir: vi.fn(),
  fsCopy: vi.fn(),
}));
vi.mock("../services/tauri-watch", () => ({
  startWatch: vi.fn(),
  stopWatch: vi.fn(),
  onFileChange: vi.fn(),
}));

import { createContext } from "./context";
import {
  initStorageRoot,
  resetStorageRootForTests,
} from "./extension-storage-dirs";
import { store } from "../state/store";
import { deleteWorkspace } from "../state/workspaces";

function openWorkspace(folder: string, extraFolders: string[] = []) {
  store.workspaces = {
    w1: { id: "w1", name: "ws", folder, extraFolders },
  } as never;
  store.activeWorkspaceId = "w1";
}

beforeEach(() => {
  readTextMock.mockClear();
  writeTextMock.mockClear();
  createDirMock.mockClear();
  deleteMock.mockClear();
  resetStorageRootForTests();
  store.workspaces = {};
  store.activeWorkspaceId = null;
});

describe("createContext filesystem scoping", () => {
  it("confines an untrusted extension to the workspace", async () => {
    openWorkspace("/work/project");
    const ctx = createContext("third.party");

    await expect(ctx.files.readText("/etc/hosts")).rejects.toBeInstanceOf(
      PathDeniedError,
    );
    expect(readTextMock).not.toHaveBeenCalled();
  });

  it("resolves an untrusted relative path against the workspace root", async () => {
    openWorkspace("/work/project");
    const ctx = createContext("third.party");

    await expect(ctx.files.readText("src/a.ts")).resolves.toBe("file-contents");
    expect(readTextMock).toHaveBeenCalledWith("/work/project/src/a.ts");
  });

  it("leaves a trusted (builtin) extension unscoped", async () => {
    openWorkspace("/work/project");
    const ctx = createContext("core.thing", { trusted: true });

    await expect(ctx.files.readText("/etc/hosts")).resolves.toBe(
      "file-contents",
    );
    expect(readTextMock).toHaveBeenCalledWith("/etc/hosts");
  });

  it("lifts the confinement for a granted permission", async () => {
    openWorkspace("/work/project");
    const ctx = createContext("third.party", { permissions: ["fs:read"] });

    await expect(ctx.files.readText("/etc/hosts")).resolves.toBe(
      "file-contents",
    );
  });

  it("tracks the active workspace live", async () => {
    openWorkspace("/work/one");
    const ctx = createContext("third.party");

    // allowed under /work/one
    await expect(ctx.files.readText("/work/one/x")).resolves.toBe(
      "file-contents",
    );
    // switch workspaces — the same ctx now scopes to /work/two
    openWorkspace("/work/two");
    await expect(ctx.files.readText("/work/one/x")).rejects.toBeInstanceOf(
      PathDeniedError,
    );
    await expect(ctx.files.readText("/work/two/y")).resolves.toBe(
      "file-contents",
    );
  });

  it("denies everything for an untrusted extension with no workspace open", async () => {
    const ctx = createContext("third.party");
    await expect(ctx.files.readText("/etc/hosts")).rejects.toBeInstanceOf(
      PathDeniedError,
    );
    await expect(ctx.files.readText("relative.txt")).rejects.toBeInstanceOf(
      PathDeniedError,
    );
  });

  it("honors extraFolders as additional roots", async () => {
    openWorkspace("/work/main", ["/work/lib"]);
    const ctx = createContext("third.party");
    await expect(ctx.files.readText("/work/lib/z")).resolves.toBe(
      "file-contents",
    );
  });
});

// RFC 0032 — the per-extension storage directories on ctx.storage, and the
// ctx.files sandbox lift that makes them usable with no fs:* permission.
describe("createContext storage directories", () => {
  const ROOT = "/cfg/extension-storage";

  it("hands each extension its own global directory, created on first call", async () => {
    const ctx = createContext("third.party");
    await expect(ctx.storage.globalDir()).resolves.toBe(
      `${ROOT}/third.party/global`,
    );
    expect(createDirMock).toHaveBeenCalledWith(`${ROOT}/third.party/global`);
    const other = createContext("other.tool");
    await expect(other.storage.globalDir()).resolves.toBe(
      `${ROOT}/other.tool/global`,
    );
  });

  it("scopes workspaceDir to the active workspace and tracks a switch", async () => {
    openWorkspace("/work/one");
    const ctx = createContext("third.party");
    await expect(ctx.storage.workspaceDir()).resolves.toBe(
      `${ROOT}/third.party/workspaces/w1`,
    );
    store.workspaces = {
      w2: { id: "w2", name: "two", folder: "/work/two" },
    } as never;
    store.activeWorkspaceId = "w2";
    await expect(ctx.storage.workspaceDir()).resolves.toBe(
      `${ROOT}/third.party/workspaces/w2`,
    );
  });

  it("rejects workspaceDir with NoWorkspaceError when none is open", async () => {
    const ctx = createContext("third.party");
    await expect(ctx.storage.workspaceDir()).rejects.toBeInstanceOf(
      NoWorkspaceError,
    );
  });

  it("gives trusted (bundled) extensions the same paths", async () => {
    const ctx = createContext("silo.tasks", { trusted: true });
    await expect(ctx.storage.globalDir()).resolves.toBe(
      `${ROOT}/silo.tasks/global`,
    );
  });

  it("allows writes inside the own dir with no permissions and no workspace", async () => {
    const ctx = createContext("third.party");
    const dir = await ctx.storage.globalDir();
    await expect(
      ctx.files.writeText(`${dir}/tasks.jsonl`, "{}"),
    ).resolves.toBeUndefined();
    expect(writeTextMock).toHaveBeenCalledWith(`${dir}/tasks.jsonl`, "{}");
  });

  it("denies another extension's storage directory", async () => {
    const ctx = createContext("third.party");
    await ctx.storage.globalDir();
    await expect(
      ctx.files.readText(`${ROOT}/other.tool/global/x`),
    ).rejects.toBeInstanceOf(PathDeniedError);
  });

  // R5: an extension can cache its absolute path in ctx.storage.global in one
  // session and use it at the top of activate() in the next, never calling
  // globalDir() at all. That only works if the root is resolved at startup.
  it("accepts a cached own-dir path with no preceding globalDir() call", async () => {
    await initStorageRoot();
    const ctx = createContext("third.party");
    const cached = `${ROOT}/third.party/global/tasks.jsonl`;
    await expect(ctx.files.writeText(cached, "{}")).resolves.toBeUndefined();
    expect(writeTextMock).toHaveBeenCalledWith(cached, "{}");
  });

  // R9 — a key/value bag is app state and dies with the workspace; a file the
  // user has been editing is not. `state/` is a leaf and can't reach the host's
  // fs module, so this is guaranteed by layering — pinned here so wiring any
  // cleanup into the delete flow fails loudly rather than silently removing data.
  it("leaves the workspace's storage directory alone when the workspace is deleted", async () => {
    openWorkspace("/work/one");
    const ctx = createContext("third.party");
    await ctx.storage.workspaceDir();

    deleteWorkspace("w1");

    expect(store.workspaces.w1).toBeUndefined();
    expect(deleteMock).not.toHaveBeenCalled();
  });

  it("denies own-dir paths when the storage root never resolved", async () => {
    const ctx = createContext("third.party");
    await expect(
      ctx.files.writeText(`${ROOT}/third.party/global/x`, "{}"),
    ).rejects.toBeInstanceOf(PathDeniedError);
  });
});

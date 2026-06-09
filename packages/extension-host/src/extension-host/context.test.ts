// Integration test for createContext's filesystem/process scoping: the scope's
// roots are derived live from the active workspace, builtins (trusted) are
// unscoped, and runtime extensions (untrusted) are confined to the workspace.
// The scoped-service rules themselves live in security/*.test.ts; here we pin the
// wiring — trust flag + live workspace roots. The Tauri fs boundary is mocked so
// an *allowed* call resolves instead of hitting a missing backend.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { PathDeniedError } from "@silo-code/sdk";

const { readTextMock } = vi.hoisted(() => ({
  readTextMock: vi.fn(async () => "file-contents"),
}));
vi.mock("../services/tauri-fs", () => ({
  fsReadText: readTextMock,
  fsReadBytes: vi.fn(),
  fsWriteText: vi.fn(),
  fsCreateDir: vi.fn(),
  fsPathExists: vi.fn(),
  fsRename: vi.fn(),
  fsDelete: vi.fn(),
  fsReveal: vi.fn(),
  fsReadDir: vi.fn(),
}));
vi.mock("../services/tauri-watch", () => ({
  startWatch: vi.fn(),
  stopWatch: vi.fn(),
  onFileChange: vi.fn(),
}));

import { createContext } from "./context";
import { store } from "../state/store";

function openWorkspace(folder: string, extraFolders: string[] = []) {
  store.workspaces = {
    w1: { id: "w1", name: "ws", folder, extraFolders },
  } as never;
  store.activeWorkspaceId = "w1";
}

beforeEach(() => {
  readTextMock.mockClear();
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

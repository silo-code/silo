// The on-disk layout owner for per-extension storage directories (RFC 0032):
// path shapes, id namespacing, lazy creation, the sync `ownDirPaths` the path
// scope reads, the uninstall data probe, and the id-migration rename. The Tauri
// fs boundary is faked over a flat map, so nothing here touches a real disk.

import { describe, it, expect, beforeEach, vi } from "vitest";

const { fsMap, dirs, createDirSpy, renameSpy, deleteSpy, configDirMock } =
  vi.hoisted(() => {
    const fsMap = new Map<string, number>(); // path → size in bytes
    const dirs = new Set<string>();
    return {
      fsMap,
      dirs,
      createDirSpy: vi.fn(async (p: string) => void dirs.add(p)),
      renameSpy: vi.fn(async (from: string, to: string) => {
        for (const [key, size] of [...fsMap.entries()]) {
          if (key === from || key.startsWith(`${from}/`)) {
            fsMap.delete(key);
            fsMap.set(`${to}${key.slice(from.length)}`, size);
          }
        }
        for (const d of [...dirs]) {
          if (d === from || d.startsWith(`${from}/`)) {
            dirs.delete(d);
            dirs.add(`${to}${d.slice(from.length)}`);
          }
        }
      }),
      deleteSpy: vi.fn(async (p: string) => {
        for (const key of [...fsMap.keys()]) {
          if (key === p || key.startsWith(`${p}/`)) fsMap.delete(key);
        }
        for (const d of [...dirs]) {
          if (d === p || d.startsWith(`${p}/`)) dirs.delete(d);
        }
      }),
      configDirMock: vi.fn(async () => "/cfg"),
    };
  });

vi.mock("../services/user-config", () => ({ userConfigDir: configDirMock }));
vi.mock("../services/tauri-fs", () => ({
  fsCreateDir: createDirSpy,
  fsDelete: deleteSpy,
  fsRename: renameSpy,
  fsPathExists: async (p: string) =>
    dirs.has(p) ||
    fsMap.has(p) ||
    [...fsMap.keys(), ...dirs].some((k) => k.startsWith(`${p}/`)),
  // Immediate children of `p`, split into files and directories, in the shape
  // the real `fsReadDir` returns.
  fsReadDir: async (p: string) => {
    const prefix = `${p}/`;
    const seen = new Map<string, { isDir: boolean; size: number }>();
    for (const [key, size] of fsMap.entries()) {
      if (!key.startsWith(prefix)) continue;
      const rest = key.slice(prefix.length);
      const slash = rest.indexOf("/");
      if (slash === -1) seen.set(rest, { isDir: false, size });
      else seen.set(rest.slice(0, slash), { isDir: true, size: 0 });
    }
    for (const d of dirs) {
      if (!d.startsWith(prefix)) continue;
      const rest = d.slice(prefix.length);
      const name = rest.includes("/") ? rest.slice(0, rest.indexOf("/")) : rest;
      if (!seen.has(name)) seen.set(name, { isDir: true, size: 0 });
    }
    return [...seen.entries()].map(([name, meta]) => ({
      name,
      path: `${p}/${name}`,
      isDir: meta.isDir,
      size: meta.size,
      modifiedMs: 0,
    }));
  },
}));

import {
  deleteExtensionData,
  ensureGlobalDir,
  resolveWorkspaceDir,
  extensionDataExists,
  extensionDataInfo,
  initStorageRoot,
  isStoragePath,
  ownDirPaths,
  renameExtensionData,
  resetStorageRootForTests,
  storageRootPath,
} from "./extension-storage-dirs";

const ROOT = "/cfg/extension-storage";

beforeEach(() => {
  fsMap.clear();
  dirs.clear();
  vi.clearAllMocks();
  configDirMock.mockImplementation(async () => "/cfg");
  resetStorageRootForTests();
});

describe("initStorageRoot", () => {
  it("resolves under the identity-keyed user-config root", async () => {
    expect(await initStorageRoot()).toBe(ROOT);
    expect(storageRootPath()).toBe(ROOT);
  });

  it("is identity-keyed — a dev build resolves under its own root", async () => {
    configDirMock.mockImplementation(async () => "/home/u/.config/silo-dev");
    expect(await initStorageRoot()).toBe(
      "/home/u/.config/silo-dev/extension-storage",
    );
  });

  it("shares one in-flight promise and resolves the config dir once", async () => {
    const [a, b] = await Promise.all([initStorageRoot(), initStorageRoot()]);
    expect(a).toBe(b);
    expect(configDirMock).toHaveBeenCalledTimes(1);
  });

  it("creates nothing on disk by itself", async () => {
    await initStorageRoot();
    expect(createDirSpy).not.toHaveBeenCalled();
  });

  it("leaves the root unset when resolution fails", async () => {
    configDirMock.mockImplementation(async () => {
      throw new Error("no home");
    });
    await expect(initStorageRoot()).rejects.toThrow("no home");
    expect(storageRootPath()).toBeNull();
    expect(ownDirPaths("acme.hello", ["ws_1"])).toEqual([]);
  });
});

describe("ownDirPaths", () => {
  it("is empty before the root resolves", () => {
    expect(ownDirPaths("acme.hello", ["ws_1"])).toEqual([]);
  });

  it("lists the global dir, and a dir per open workspace", async () => {
    await initStorageRoot();
    expect(ownDirPaths("acme.hello")).toEqual([`${ROOT}/acme.hello/global`]);
    expect(ownDirPaths("acme.hello", ["ws_1"])).toEqual([
      `${ROOT}/acme.hello/global`,
      `${ROOT}/acme.hello/workspaces/ws_1`,
    ]);
    expect(ownDirPaths("acme.hello", ["ws_1", "ws_2"])).toEqual([
      `${ROOT}/acme.hello/global`,
      `${ROOT}/acme.hello/workspaces/ws_1`,
      `${ROOT}/acme.hello/workspaces/ws_2`,
    ]);
  });

  it("does not require the directories to exist yet", async () => {
    await initStorageRoot();
    // A path cached by an extension in a previous session must be allowed at
    // the top of activate(), before any globalDir() call creates anything.
    expect(ownDirPaths("acme.hello", ["ws_1"])).toHaveLength(2);
    expect(createDirSpy).not.toHaveBeenCalled();
  });

  it("namespaces by extension id — two extensions never share a path", async () => {
    await initStorageRoot();
    const a = ownDirPaths("acme.hello", ["ws_1"]);
    const b = ownDirPaths("other.tool", ["ws_1"]);
    expect(a.some((p) => b.includes(p))).toBe(false);
  });

  it("refuses ids and workspace ids outside the manifest charset", async () => {
    await initStorageRoot();
    expect(ownDirPaths("../escape", ["ws_1"])).toEqual([]);
    expect(ownDirPaths(".hidden", ["ws_1"])).toEqual([]);
    expect(ownDirPaths("acme.hello", ["../escape"])).toEqual([
      `${ROOT}/acme.hello/global`,
    ]);
  });
});

describe("isStoragePath", () => {
  it("is false before the root resolves", () => {
    expect(isStoragePath(`${ROOT}/acme.hello/global/x`)).toBe(false);
  });

  it("matches the root and everything under it, and nothing else", async () => {
    await initStorageRoot();
    expect(isStoragePath(ROOT)).toBe(true);
    expect(isStoragePath(`${ROOT}/acme.hello/global/cache/x.json`)).toBe(true);
    expect(isStoragePath("/cfg/extension-storage-evil/x")).toBe(false);
    expect(isStoragePath("/work/project/src/x.ts")).toBe(false);
  });

  // A SILO_CONFIG_DIR override is used verbatim, so the root can carry a
  // trailing slash while paths reaching here have been normalized by
  // `resolvePath`. A raw string compare would miss and quietly re-enable the
  // watcher's noise filter inside storage.
  it("matches regardless of slash noise in the configured root", async () => {
    configDirMock.mockImplementation(async () => "/cfg/");
    await initStorageRoot();
    expect(isStoragePath("/cfg/extension-storage/acme.hello/global/x")).toBe(
      true,
    );
    expect(isStoragePath("/cfg/extension-storage")).toBe(true);
    expect(isStoragePath("/cfg/other/x")).toBe(false);
  });
});

describe("ensureGlobalDir / resolveWorkspaceDir", () => {
  it("creates on first call and returns a stable path", async () => {
    const first = await ensureGlobalDir("acme.hello");
    const second = await ensureGlobalDir("acme.hello");
    expect(first).toBe(`${ROOT}/acme.hello/global`);
    expect(second).toBe(first);
    expect(createDirSpy).toHaveBeenCalledWith(first);
  });

  it("keys the workspace dir by workspace id, creating by default", async () => {
    expect(await resolveWorkspaceDir("acme.hello", "ws_1")).toBe(
      `${ROOT}/acme.hello/workspaces/ws_1`,
    );
    expect(await resolveWorkspaceDir("acme.hello", "ws_2")).toBe(
      `${ROOT}/acme.hello/workspaces/ws_2`,
    );
    expect(createDirSpy).toHaveBeenCalledWith(
      `${ROOT}/acme.hello/workspaces/ws_1`,
    );
  });

  it("resolves the path without creating it when create is false", async () => {
    const dir = await resolveWorkspaceDir("acme.hello", "ws_1", {
      create: false,
    });
    expect(dir).toBe(`${ROOT}/acme.hello/workspaces/ws_1`);
    expect(createDirSpy).not.toHaveBeenCalled();
    expect(dirs.has(dir)).toBe(false);
  });

  it("never lets a workspace dir land inside the global dir", async () => {
    const global = await ensureGlobalDir("acme.hello");
    const ws = await resolveWorkspaceDir("acme.hello", "ws_1");
    expect(ws.startsWith(`${global}/`)).toBe(false);
  });

  it("rejects an id that would escape the root", async () => {
    await expect(ensureGlobalDir("../escape")).rejects.toThrow(
      /Invalid extension id/,
    );
    await expect(resolveWorkspaceDir("acme.hello", "..")).rejects.toThrow(
      /Invalid workspace id/,
    );
    await expect(
      resolveWorkspaceDir("acme.hello", "..", { create: false }),
    ).rejects.toThrow(/Invalid workspace id/);
  });
});

describe("extensionDataInfo", () => {
  it("is null when the directory is absent", async () => {
    await initStorageRoot();
    expect(await extensionDataInfo("acme.hello")).toBeNull();
  });

  it("is null when the directory exists but holds no files", async () => {
    await ensureGlobalDir("acme.hello");
    expect(await extensionDataInfo("acme.hello")).toBeNull();
    expect(await extensionDataExists("acme.hello")).toBe(true);
  });

  it("counts files and bytes across both scopes, recursively", async () => {
    await initStorageRoot();
    fsMap.set(`${ROOT}/acme.hello/global/tasks.jsonl`, 1000);
    fsMap.set(`${ROOT}/acme.hello/global/cache/a.bin`, 24);
    fsMap.set(`${ROOT}/acme.hello/workspaces/ws_1/notes.md`, 200);
    const info = await extensionDataInfo("acme.hello");
    expect(info).toEqual({
      path: `${ROOT}/acme.hello`,
      files: 3,
      bytes: 1224,
      truncated: false,
    });
  });

  it("reports 'size unknown' rather than a floor once the entry cap trips", async () => {
    await initStorageRoot();
    for (let i = 0; i < 5_001; i++) {
      fsMap.set(`${ROOT}/acme.hello/global/f${i}.txt`, 1);
    }
    const info = await extensionDataInfo("acme.hello");
    expect(info).toMatchObject({ truncated: true });
  });

  // A capped walk means "we don't know", never "nothing to lose" — uninstall
  // deletes a file-free directory unconditionally, so returning null here would
  // silently destroy deeply-nested data.
  it("stops descending past the depth cap without reporting the dir as empty", async () => {
    await initStorageRoot();
    const deep = Array.from({ length: 14 }, (_, i) => `d${i}`).join("/");
    fsMap.set(`${ROOT}/acme.hello/global/${deep}/buried.txt`, 10);
    const info = await extensionDataInfo("acme.hello");
    expect(info).not.toBeNull();
    expect(info).toMatchObject({ files: 0, truncated: true });
  });

  it("reports 'size unknown' rather than blocking when the walk fails", async () => {
    await initStorageRoot();
    fsMap.set(`${ROOT}/acme.hello/global/tasks.jsonl`, 10);
    const fs = await import("../services/tauri-fs");
    vi.spyOn(fs, "fsReadDir").mockRejectedValue(new Error("EACCES"));
    const info = await extensionDataInfo("acme.hello");
    expect(info).toMatchObject({ truncated: true });
    vi.restoreAllMocks();
  });
});

describe("deleteExtensionData", () => {
  it("removes the whole subtree, workspaces included", async () => {
    await initStorageRoot();
    fsMap.set(`${ROOT}/acme.hello/global/a.json`, 1);
    fsMap.set(`${ROOT}/acme.hello/workspaces/ws_1/b.json`, 1);
    await deleteExtensionData("acme.hello");
    expect(deleteSpy).toHaveBeenCalledWith(`${ROOT}/acme.hello`);
    expect(await extensionDataExists("acme.hello")).toBe(false);
  });

  it("is a no-op when there is nothing there", async () => {
    await initStorageRoot();
    await deleteExtensionData("acme.hello");
    expect(deleteSpy).not.toHaveBeenCalled();
  });
});

describe("renameExtensionData", () => {
  it("moves the directory, preserving both scopes", async () => {
    await initStorageRoot();
    fsMap.set(`${ROOT}/silo.agent-monitor/global/a.json`, 1);
    fsMap.set(`${ROOT}/silo.agent-monitor/workspaces/ws_1/b.json`, 1);
    await renameExtensionData("silo.agent-monitor", "silo.agents");
    expect(fsMap.has(`${ROOT}/silo.agents/global/a.json`)).toBe(true);
    expect(fsMap.has(`${ROOT}/silo.agents/workspaces/ws_1/b.json`)).toBe(true);
    expect(await extensionDataExists("silo.agent-monitor")).toBe(false);
  });

  it("is idempotent — re-running finds nothing to do", async () => {
    await initStorageRoot();
    fsMap.set(`${ROOT}/silo.agent-monitor/global/a.json`, 1);
    await renameExtensionData("silo.agent-monitor", "silo.agents");
    renameSpy.mockClear();
    await renameExtensionData("silo.agent-monitor", "silo.agents");
    expect(renameSpy).not.toHaveBeenCalled();
  });

  it("refuses to clobber an existing destination, leaving both in place", async () => {
    await initStorageRoot();
    fsMap.set(`${ROOT}/silo.agent-monitor/global/old.json`, 1);
    fsMap.set(`${ROOT}/silo.agents/global/new.json`, 1);
    await renameExtensionData("silo.agent-monitor", "silo.agents");
    expect(renameSpy).not.toHaveBeenCalled();
    expect(fsMap.has(`${ROOT}/silo.agent-monitor/global/old.json`)).toBe(true);
    expect(fsMap.has(`${ROOT}/silo.agents/global/new.json`)).toBe(true);
  });
});

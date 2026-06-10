// Covers the permission half of the extension manager: manifest validation, and
// that consented permissions are persisted to installed.json and threaded to the
// loader (from the record, not a possibly-edited manifest). The loader and the
// Tauri fs boundary are mocked; this stays a fast unit.

import { describe, it, expect, beforeEach, vi } from "vitest";

const { fsMap, loaderMock } = vi.hoisted(() => ({
  fsMap: new Map<string, string>(),
  loaderMock: {
    loadExtension: vi.fn(async () => {}),
    unloadExtension: vi.fn(),
    isLoaded: vi.fn(() => false),
    needsReload: vi.fn(() => false),
  },
}));

vi.mock("../services/user-config", () => ({
  userConfigDir: async () => "/cfg",
}));
vi.mock("./extension-loader", () => loaderMock);
vi.mock("../services/tauri-fs", () => ({
  fsReadText: async (p: string) => {
    const v = fsMap.get(p);
    if (v === undefined) throw new Error(`ENOENT ${p}`);
    return v;
  },
  fsWriteText: async (p: string, c: string) => void fsMap.set(p, c),
  fsCopyDir: async () => {},
  fsDelete: async (p: string) => void fsMap.delete(p),
  fsPathExists: async (p: string) => fsMap.has(p),
  // Remaining surface the scoped file service binds when a built-in activates
  // (createContext → getScopedFileService). Not exercised by these tests.
  fsReadBytes: vi.fn(),
  fsReadDir: vi.fn(),
  fsCreateDir: vi.fn(),
  fsRename: vi.fn(),
  fsReveal: vi.fn(),
}));
vi.mock("../services/tauri-watch", () => ({
  startWatch: vi.fn(),
  stopWatch: vi.fn(),
  onFileChange: vi.fn(),
}));
// Built-in enable/disable fire an async native menu re-sync; stub it (keep the
// rest of menu-items real, since createContext registers menu items against it).
vi.mock("./menu-items", async (orig) => ({
  ...(await orig<typeof import("./menu-items")>()),
  syncMenu: vi.fn(async () => {}),
}));

import {
  getExtensionManager,
  validateManifestPermissions,
} from "./extension-manager";
import { registerBuiltins } from "./builtins-registry";
import type { Extension } from "@silo-code/sdk";

const INSTALLED = "/cfg/extensions/installed.json";

function manifest(perms?: unknown): string {
  return JSON.stringify({
    name: "Acme",
    version: "1.0.0",
    silo: {
      id: "acme.x",
      main: "dist/index.js",
      ...(perms === undefined ? {} : { permissions: perms }),
    },
  });
}

const mgr = getExtensionManager();

beforeEach(() => {
  fsMap.clear();
  loaderMock.loadExtension.mockClear();
  loaderMock.unloadExtension.mockClear();
  loaderMock.isLoaded.mockReturnValue(false);
  loaderMock.needsReload.mockReturnValue(false);
  // Reset the built-in registry so merged rows / dispatch start clean.
  registerBuiltins([], new Set());
});

/** A fake silo.* built-in for the dispatch tests. */
function fakeBuiltin(id: string, name: string): Extension {
  return { id, manifest: { name }, activate() {} };
}

describe("validateManifestPermissions", () => {
  it("returns [] when absent", () => {
    expect(validateManifestPermissions(undefined, "x")).toEqual([]);
  });
  it("accepts known permissions and dedupes", () => {
    expect(
      validateManifestPermissions(["fs:read", "process", "fs:read"], "x"),
    ).toEqual(["fs:read", "process"]);
  });
  it("throws on an unknown permission", () => {
    expect(() => validateManifestPermissions(["fs:delete"], "x")).toThrow(
      /unknown permission/,
    );
  });
  it("throws when not an array", () => {
    expect(() => validateManifestPermissions("fs:read", "x")).toThrow(
      /must be an array/,
    );
  });
});

describe("previewInstall", () => {
  it("reports the requested permissions without writing the registry", async () => {
    fsMap.set("/src/ext/package.json", manifest(["fs:read", "network"]));
    const preview = await mgr.previewInstall("/src/ext");
    expect(preview).toEqual({
      id: "acme.x",
      name: "Acme",
      permissions: ["fs:read", "network"],
    });
    expect(fsMap.has(INSTALLED)).toBe(false);
  });
});

describe("installFromFolder", () => {
  it("persists and threads the granted permissions", async () => {
    fsMap.set("/src/ext/package.json", manifest(["fs:read", "process"]));
    // refresh() re-reads the copied manifest from the dest dir
    fsMap.set(
      "/cfg/extensions/acme.x/package.json",
      manifest(["fs:read", "process"]),
    );

    await mgr.installFromFolder("/src/ext");

    expect(loaderMock.loadExtension).toHaveBeenCalledWith({
      id: "acme.x",
      dir: "/cfg/extensions/acme.x",
      main: "dist/index.js",
      permissions: ["fs:read", "process"],
    });
    const record = JSON.parse(fsMap.get(INSTALLED)!).extensions[0];
    expect(record.permissions).toEqual(["fs:read", "process"]);
  });
});

describe("loadInstalled", () => {
  it("loads with the persisted grant, not the current manifest", async () => {
    fsMap.set(
      INSTALLED,
      JSON.stringify({
        version: 1,
        extensions: [
          {
            id: "acme.x",
            dir: "acme.x",
            enabled: true,
            permissions: ["fs:write"],
          },
        ],
      }),
    );
    // A manifest that now asks for more than was granted must not widen access.
    fsMap.set(
      "/cfg/extensions/acme.x/package.json",
      manifest(["fs:read", "fs:write", "process"]),
    );

    await mgr.loadInstalled();

    expect(loaderMock.loadExtension).toHaveBeenCalledWith({
      id: "acme.x",
      dir: "/cfg/extensions/acme.x",
      main: "dist/index.js",
      permissions: ["fs:write"],
    });
  });
});

describe("publisher (brand) derivation", () => {
  function publishManifest(publisher?: string): string {
    return JSON.stringify({
      name: "Acme",
      version: "1.0.0",
      silo: {
        id: "acme.x",
        main: "dist/index.js",
        ...(publisher === undefined ? {} : { publisher }),
      },
    });
  }

  async function rowFor(pkg: string) {
    fsMap.set(
      INSTALLED,
      JSON.stringify({
        version: 1,
        extensions: [{ id: "acme.x", dir: "acme.x", enabled: true }],
      }),
    );
    fsMap.set("/cfg/extensions/acme.x/package.json", pkg);
    await mgr.loadInstalled();
    return mgr.getState().extensions.find((e) => e.id === "acme.x")!;
  }

  it("uses the declared silo.publisher", async () => {
    const row = await rowFor(publishManifest("Acme Corp"));
    expect(row.publisher).toBe("Acme Corp");
    expect(row.builtin).toBe(false);
  });

  it("falls back to the id namespace when no publisher is declared", async () => {
    const row = await rowFor(publishManifest());
    expect(row.publisher).toBe("acme");
  });
});

describe("built-in dispatch + persistence", () => {
  it("merges built-in rows (branded Silo, not uninstallable) into the list", async () => {
    registerBuiltins([fakeBuiltin("silo.demo", "Demo")], new Set());
    await mgr.loadInstalled(); // triggers refresh

    const row = mgr.getState().extensions.find((e) => e.id === "silo.demo")!;
    expect(row).toMatchObject({
      name: "Demo",
      publisher: "Silo",
      builtin: true,
      enabled: true,
    });
  });

  it("disable persists the id to disabledBuiltins; enable removes it", async () => {
    registerBuiltins([fakeBuiltin("silo.demo", "Demo")], new Set());

    await mgr.disable("silo.demo");
    expect(JSON.parse(fsMap.get(INSTALLED)!).disabledBuiltins).toEqual([
      "silo.demo",
    ]);
    expect(
      mgr.getState().extensions.find((e) => e.id === "silo.demo")?.enabled,
    ).toBe(false);
    expect(await mgr.readDisabledBuiltins()).toEqual(new Set(["silo.demo"]));

    await mgr.enable("silo.demo");
    expect(JSON.parse(fsMap.get(INSTALLED)!).disabledBuiltins).toEqual([]);
    expect(
      mgr.getState().extensions.find((e) => e.id === "silo.demo")?.enabled,
    ).toBe(true);
  });

  it("rejects uninstalling a built-in", async () => {
    registerBuiltins([fakeBuiltin("silo.demo", "Demo")], new Set());
    await expect(mgr.uninstall("silo.demo")).rejects.toThrow(
      /can't be uninstalled/,
    );
  });

  it("applyDisabledBuiltins tears down the persisted set without re-persisting", async () => {
    registerBuiltins(
      [fakeBuiltin("silo.demo", "Demo"), fakeBuiltin("silo.keep", "Keep")],
      new Set(),
    );
    const installed = JSON.stringify({
      version: 1,
      extensions: [],
      disabledBuiltins: ["silo.demo"],
    });
    fsMap.set(INSTALLED, installed);

    await mgr.applyDisabledBuiltins();

    const rows = mgr.getState().extensions;
    expect(rows.find((e) => e.id === "silo.demo")?.enabled).toBe(false);
    expect(rows.find((e) => e.id === "silo.keep")?.enabled).toBe(true);
    // No re-write — the file is byte-identical to what we set.
    expect(fsMap.get(INSTALLED)).toBe(installed);
  });

  it("reads the persisted disabled set for startup", async () => {
    fsMap.set(
      INSTALLED,
      JSON.stringify({
        version: 1,
        extensions: [],
        disabledBuiltins: ["silo.a", "silo.b"],
      }),
    );
    expect(await mgr.readDisabledBuiltins()).toEqual(
      new Set(["silo.a", "silo.b"]),
    );
  });
});

// Covers the permission half of the extension manager: manifest validation, and
// that consented permissions are persisted to installed.json and threaded to the
// loader (from the record, not a possibly-edited manifest). The loader and the
// Tauri fs boundary are mocked; this stays a fast unit.

import { describe, it, expect, beforeEach, vi } from "vitest";

const { fsMap, loaderMock, invokeMock, fsDeleteSpy } = vi.hoisted(() => {
  const fsMap = new Map<string, string>();
  return {
    fsMap,
    loaderMock: {
      loadExtension: vi.fn(async () => {}),
      unloadExtension: vi.fn(),
      isLoaded: vi.fn(() => false),
      needsReload: vi.fn(() => false),
    },
    invokeMock: vi.fn(async () => {}),
    fsDeleteSpy: vi.fn(async (p: string) => {
      fsMap.delete(p);
    }),
  };
});

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
  fsDelete: fsDeleteSpy,
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
vi.mock("@tauri-apps/api/path", () => ({
  tempDir: async () => "/tmp/",
}));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));
vi.mock("../services/tauri-app", () => ({
  appVersion: async () => "0.15.0",
  appName: async () => "Silo",
}));

import {
  getExtensionManager,
  validateManifestPermissions,
  resolveNpmTarball,
  findPackageRoot,
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
  invokeMock.mockClear().mockResolvedValue(undefined);
  fsDeleteSpy.mockClear();
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
      engine: undefined,
      hostVersion: "0.15.0",
      engineCompatible: true,
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

// ---- npm / URL install --------------------------------------------------

function npmMeta(
  version = "1.0.0",
  tarball = `https://registry.npmjs.org/pkg/-/pkg-${version}.tgz`,
) {
  return {
    "dist-tags": { latest: version },
    versions: { [version]: { dist: { tarball } } },
  };
}

function okFetch(body: unknown): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  });
}

describe("resolveNpmTarball", () => {
  it("fetches the registry URL for a plain package name", async () => {
    global.fetch = okFetch(npmMeta());
    await resolveNpmTarball("my-pkg");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://registry.npmjs.org/my-pkg",
    );
  });

  it("returns the latest tarball URL", async () => {
    const tarball = "https://registry.npmjs.org/pkg/-/pkg-3.0.0.tgz";
    global.fetch = okFetch(npmMeta("3.0.0", tarball));
    expect(await resolveNpmTarball("pkg")).toBe(tarball);
  });

  it("uses an explicit version tag from pkg@2.0.0", async () => {
    const tarball = "https://registry.npmjs.org/pkg/-/pkg-2.0.0.tgz";
    global.fetch = okFetch({
      "dist-tags": { latest: "1.0.0" },
      versions: {
        "1.0.0": { dist: { tarball: "https://example.com/1.tgz" } },
        "2.0.0": { dist: { tarball } },
      },
    });
    expect(await resolveNpmTarball("pkg@2.0.0")).toBe(tarball);
  });

  it("handles scoped @scope/pkg — splits at the last @ only", async () => {
    const tarball = "https://registry.npmjs.org/@scope/pkg/-/pkg-1.0.0.tgz";
    global.fetch = okFetch(npmMeta("1.0.0", tarball));
    const result = await resolveNpmTarball("@scope/pkg");
    // URL encodes @ → %40 then re-exposes /
    expect(global.fetch).toHaveBeenCalledWith(
      "https://registry.npmjs.org/%40scope/pkg",
    );
    expect(result).toBe(tarball);
  });

  it("handles @scope/pkg@1.2.0 — extracts version while preserving scope", async () => {
    const tarball = "https://registry.npmjs.org/@scope/pkg/-/pkg-1.2.0.tgz";
    global.fetch = okFetch({
      "dist-tags": { latest: "2.0.0" },
      versions: {
        "2.0.0": { dist: { tarball: "https://example.com/2.tgz" } },
        "1.2.0": { dist: { tarball } },
      },
    });
    const result = await resolveNpmTarball("@scope/pkg@1.2.0");
    expect(global.fetch).toHaveBeenCalledWith(
      "https://registry.npmjs.org/%40scope/pkg",
    );
    expect(result).toBe(tarball);
  });

  it("throws when the registry returns a non-2xx status", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });
    await expect(resolveNpmTarball("no-such-pkg")).rejects.toThrow("HTTP 404");
  });

  it("throws when the requested version is absent", async () => {
    global.fetch = okFetch({
      "dist-tags": { latest: "1.0.0" },
      versions: { "1.0.0": { dist: { tarball: "https://x.com/1.tgz" } } },
    });
    await expect(resolveNpmTarball("pkg@9.9.9")).rejects.toThrow(
      /not found for/,
    );
  });
});

describe("findPackageRoot", () => {
  it("prefers the npm layout (package/package.json)", async () => {
    fsMap.set("/staging/package/package.json", "{}");
    fsMap.set("/staging/package.json", "{}");
    expect(await findPackageRoot("/staging")).toBe("/staging/package");
  });

  it("falls back to flat layout when no package/ subdir", async () => {
    fsMap.set("/staging/package.json", "{}");
    expect(await findPackageRoot("/staging")).toBe("/staging");
  });

  it("throws when neither layout is present", async () => {
    await expect(findPackageRoot("/staging")).rejects.toThrow(
      /Could not find package\.json/,
    );
  });
});

describe("installFromUrl (integration)", () => {
  function populateStaging(
    destDir: string,
    layout: "npm" | "flat" = "npm",
  ): void {
    const pkgJson = manifest(["fs:read"]);
    if (layout === "npm") {
      fsMap.set(`${destDir}/package/package.json`, pkgJson);
    } else {
      fsMap.set(`${destDir}/package.json`, pkgJson);
    }
    // refresh() reads from the installed destination after fsCopyDir (which is
    // a no-op mock), so pre-seed the extension's final location too.
    fsMap.set("/cfg/extensions/acme.x/package.json", manifest(["fs:read"]));
  }

  it("installs when consent is granted", async () => {
    invokeMock.mockImplementation(
      async (_cmd: string, args: { destDir?: string }) => {
        if (args.destDir) populateStaging(args.destDir);
      },
    );

    await mgr.installFromUrl("https://example.com/ext.tgz", async () => true);

    expect(loaderMock.loadExtension).toHaveBeenCalledWith(
      expect.objectContaining({ id: "acme.x" }),
    );
  });

  it("skips install when consent is denied but still cleans up", async () => {
    let stagingDir = "";
    invokeMock.mockImplementation(
      async (_cmd: string, args: { destDir?: string }) => {
        if (args.destDir) {
          stagingDir = args.destDir;
          populateStaging(args.destDir);
        }
      },
    );

    await mgr.installFromUrl("https://example.com/ext.tgz", async () => false);

    expect(loaderMock.loadExtension).not.toHaveBeenCalled();
    expect(fsDeleteSpy).toHaveBeenCalledWith(stagingDir);
  });

  it("cleans up staging dir even when previewInstall throws", async () => {
    let stagingDir = "";
    invokeMock.mockImplementation(
      async (_cmd: string, args: { destDir?: string }) => {
        if (args.destDir) {
          stagingDir = args.destDir;
          // Bad permission → validateManifestPermissions throws inside previewInstall
          fsMap.set(`${args.destDir}/package/package.json`, manifest(["bad"]));
        }
      },
    );

    await expect(
      mgr.installFromUrl("https://example.com/ext.tgz", async () => true),
    ).rejects.toThrow(/unknown permission/);

    expect(fsDeleteSpy).toHaveBeenCalledWith(stagingDir);
  });

  it("passes the resolved tarball URL to download_extract", async () => {
    const tarball = "https://registry.npmjs.org/pkg/-/pkg-1.0.0.tgz";
    global.fetch = okFetch(npmMeta("1.0.0", tarball));
    invokeMock.mockImplementation(
      async (_cmd: string, args: { destDir?: string }) => {
        if (args.destDir) populateStaging(args.destDir);
      },
    );

    await mgr.installFromNpm("pkg", async () => true);

    expect(invokeMock).toHaveBeenCalledWith(
      "download_extract",
      expect.objectContaining({ url: tarball }),
    );
  });
});

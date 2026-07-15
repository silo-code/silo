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
    // Directory semantics over the flat map: deleting a path also deletes
    // everything under it (the update flow deletes/renames whole install dirs).
    fsDeleteSpy: vi.fn(async (p: string) => {
      for (const key of [...fsMap.keys()]) {
        if (key === p || key.startsWith(`${p}/`)) fsMap.delete(key);
      }
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
  // Real directory copy/move/exists over the flat map, so the update flow's
  // backup-rename-swap can be asserted on actual file contents.
  fsCopyDir: async (src: string, dst: string) => {
    for (const [key, val] of [...fsMap.entries()]) {
      if (key.startsWith(`${src}/`))
        fsMap.set(`${dst}${key.slice(src.length)}`, val);
    }
  },
  fsDelete: fsDeleteSpy,
  fsPathExists: async (p: string) =>
    fsMap.has(p) || [...fsMap.keys()].some((k) => k.startsWith(`${p}/`)),
  fsRename: async (from: string, to: string) => {
    for (const [key, val] of [...fsMap.entries()]) {
      if (key === from || key.startsWith(`${from}/`)) {
        fsMap.delete(key);
        fsMap.set(`${to}${key.slice(from.length)}`, val);
      }
    }
  },
  // Remaining surface the scoped file service binds when a built-in activates
  // (createContext → getScopedFileService). Not exercised by these tests.
  fsReadBytes: vi.fn(),
  fsReadDir: vi.fn(),
  fsCreateDir: vi.fn(),
  fsWriteBytes: vi.fn(),
  fsStat: vi.fn(),
  fsReveal: vi.fn(),
  fsCopy: vi.fn(),
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
  updateNeedsConsent,
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
  it("accepts the webview permission", () => {
    expect(validateManifestPermissions(["webview"], "x")).toEqual(["webview"]);
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

// ---- install source + in-place update -----------------------------------

function installedRecord(id = "acme.x") {
  return JSON.parse(fsMap.get(INSTALLED)!).extensions.find(
    (e: { id: string }) => e.id === id,
  );
}

describe("install source recording", () => {
  /** Stage a tarball extraction: manifest + a bundle file with `content`. */
  function stageWith(content: string) {
    return async (_cmd: string, args: { destDir?: string }) => {
      if (args.destDir) {
        fsMap.set(
          `${args.destDir}/package/package.json`,
          manifest(["fs:read"]),
        );
        fsMap.set(`${args.destDir}/package/dist/index.js`, content);
      }
    };
  }

  it("installFromFolder records a folder source (trailing slash trimmed)", async () => {
    fsMap.set("/src/ext/package.json", manifest());
    await mgr.installFromFolder("/src/ext/");
    expect(installedRecord().source).toEqual({
      kind: "folder",
      value: "/src/ext",
    });
  });

  it("installFromUrl records the URL, not the staging dir", async () => {
    invokeMock.mockImplementation(stageWith("v1"));
    await mgr.installFromUrl("https://example.com/ext.tgz", async () => true);
    expect(installedRecord().source).toEqual({
      kind: "url",
      value: "https://example.com/ext.tgz",
    });
  });

  it("installFromNpm records the original spec, not the resolved tarball", async () => {
    global.fetch = okFetch(npmMeta());
    invokeMock.mockImplementation(stageWith("v1"));
    await mgr.installFromNpm("pkg", async () => true);
    expect(installedRecord().source).toEqual({ kind: "npm", value: "pkg" });
  });

  it("reinstalling the same id replaces the recorded source", async () => {
    fsMap.set("/src/a/package.json", manifest());
    fsMap.set("/src/b/package.json", manifest());
    await mgr.installFromFolder("/src/a");
    await mgr.installFromFolder("/src/b");
    const recs = JSON.parse(fsMap.get(INSTALLED)!).extensions;
    expect(recs).toHaveLength(1);
    expect(recs[0].source).toEqual({ kind: "folder", value: "/src/b" });
  });
});

describe("updateNeedsConsent", () => {
  it("skips the prompt when permissions are unchanged or narrowed", () => {
    expect(
      updateNeedsConsent(["fs:read"], {
        permissions: ["fs:read"],
        engineCompatible: true,
      }),
    ).toBe(false);
    expect(
      updateNeedsConsent(["fs:read", "process"], {
        permissions: ["fs:read"],
        engineCompatible: true,
      }),
    ).toBe(false);
    expect(
      updateNeedsConsent([], { permissions: [], engineCompatible: true }),
    ).toBe(false);
  });

  it("prompts when the set widens", () => {
    expect(
      updateNeedsConsent(["fs:read"], {
        permissions: ["fs:read", "network"],
        engineCompatible: true,
      }),
    ).toBe(true);
    expect(
      updateNeedsConsent([], {
        permissions: ["fs:read"],
        engineCompatible: true,
      }),
    ).toBe(true);
  });

  it("prompts when the engine floor is unmet, even with equal permissions", () => {
    expect(
      updateNeedsConsent(["fs:read"], {
        permissions: ["fs:read"],
        engineCompatible: false,
      }),
    ).toBe(true);
  });
});

describe("update", () => {
  const DEST = "/cfg/extensions/acme.x";

  /** Install acme.x from a source folder with a v1 bundle, then reset spies. */
  async function installV1(perms: unknown = ["fs:read"]) {
    fsMap.set("/src/ext/package.json", manifest(perms));
    fsMap.set("/src/ext/dist/index.js", "v1");
    await mgr.installFromFolder("/src/ext");
    loaderMock.loadExtension.mockClear();
    loaderMock.unloadExtension.mockClear();
  }

  it("swaps files in place from the folder source and reloads, without a prompt", async () => {
    await installV1(["fs:read"]);
    loaderMock.isLoaded.mockReturnValue(true);
    fsMap.set("/src/ext/dist/index.js", "v2");
    const consent = vi.fn(async () => true);

    await mgr.update("acme.x", consent);

    expect(consent).not.toHaveBeenCalled(); // permissions unchanged
    expect(loaderMock.unloadExtension).toHaveBeenCalledWith("acme.x");
    expect(fsMap.get(`${DEST}/dist/index.js`)).toBe("v2");
    expect(loaderMock.loadExtension).toHaveBeenCalledWith({
      id: "acme.x",
      dir: DEST,
      main: "dist/index.js",
      permissions: ["fs:read"],
    });
    // Backup committed away; record keeps its identity, source, and enabled state.
    expect([...fsMap.keys()].some((k) => k.includes(".update-"))).toBe(false);
    expect(installedRecord()).toMatchObject({
      id: "acme.x",
      dir: "acme.x",
      enabled: true,
      source: { kind: "folder", value: "/src/ext" },
    });
  });

  it("prompts when the new manifest widens permissions, and records the new set", async () => {
    await installV1(["fs:read"]);
    fsMap.set("/src/ext/package.json", manifest(["fs:read", "network"]));
    const consent = vi.fn(async () => true);

    await mgr.update("acme.x", consent);

    expect(consent).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: ["fs:read", "network"] }),
    );
    expect(installedRecord().permissions).toEqual(["fs:read", "network"]);
    expect(loaderMock.loadExtension).toHaveBeenCalledWith(
      expect.objectContaining({ permissions: ["fs:read", "network"] }),
    );
  });

  it("aborts silently when consent is denied — nothing changes", async () => {
    await installV1(["fs:read"]);
    fsMap.set("/src/ext/package.json", manifest(["fs:read", "network"]));
    fsMap.set("/src/ext/dist/index.js", "v2");

    await mgr.update("acme.x", async () => false);

    expect(fsMap.get(`${DEST}/dist/index.js`)).toBe("v1");
    expect(installedRecord().permissions).toEqual(["fs:read"]);
    expect(loaderMock.loadExtension).not.toHaveBeenCalled();
  });

  it("re-resolves an unpinned npm spec and downloads the new tarball", async () => {
    const stage =
      (content: string) => async (_cmd: string, args: { destDir?: string }) => {
        if (args.destDir) {
          fsMap.set(
            `${args.destDir}/package/package.json`,
            manifest(["fs:read"]),
          );
          fsMap.set(`${args.destDir}/package/dist/index.js`, content);
        }
      };
    global.fetch = okFetch(npmMeta("1.0.0", "https://reg/pkg-1.tgz"));
    invokeMock.mockImplementation(stage("v1"));
    await mgr.installFromNpm("pkg", async () => true);

    global.fetch = okFetch(npmMeta("2.0.0", "https://reg/pkg-2.tgz"));
    invokeMock.mockClear().mockImplementation(stage("v2"));
    await mgr.update(
      "acme.x",
      vi.fn(async () => true),
    );

    expect(invokeMock).toHaveBeenCalledWith(
      "download_extract",
      expect.objectContaining({ url: "https://reg/pkg-2.tgz" }),
    );
    expect(fsMap.get(`${DEST}/dist/index.js`)).toBe("v2");
    // Staging cleaned up on the way out.
    expect(
      [...fsMap.keys()].some((k) => k.startsWith("/tmp/silo-install-")),
    ).toBe(false);
  });

  it("restores files, record, and the running version when the new load fails", async () => {
    await installV1(["fs:read"]);
    loaderMock.isLoaded.mockReturnValue(true);
    fsMap.set("/src/ext/package.json", manifest(["fs:read", "network"]));
    fsMap.set("/src/ext/dist/index.js", "v2");
    loaderMock.loadExtension
      .mockRejectedValueOnce(new Error("activate exploded"))
      .mockResolvedValueOnce(undefined);

    await expect(mgr.update("acme.x", async () => true)).rejects.toThrow(
      "activate exploded",
    );

    // Old files back in place.
    expect(fsMap.get(`${DEST}/dist/index.js`)).toBe("v1");
    expect(fsMap.get(`${DEST}/package.json`)).toBe(manifest(["fs:read"]));
    // Record restored byte-for-byte (old grant, still enabled).
    expect(installedRecord()).toMatchObject({
      permissions: ["fs:read"],
      enabled: true,
    });
    // Old version reloaded with the previously granted set, not the manifest.
    expect(loaderMock.loadExtension).toHaveBeenLastCalledWith(
      expect.objectContaining({ permissions: ["fs:read"] }),
    );
    expect([...fsMap.keys()].some((k) => k.includes(".update-"))).toBe(false);
  });

  it("updates a disabled extension in place without loading it", async () => {
    await installV1(["fs:read"]);
    await mgr.disable("acme.x");
    loaderMock.loadExtension.mockClear();
    fsMap.set("/src/ext/dist/index.js", "v2");

    await mgr.update("acme.x", async () => true);

    expect(loaderMock.loadExtension).not.toHaveBeenCalled();
    expect(fsMap.get(`${DEST}/dist/index.js`)).toBe("v2");
    expect(installedRecord().enabled).toBe(false);
  });

  it("rejects for built-ins, unknown ids, and legacy records without a source", async () => {
    const consent = vi.fn(async () => true);
    registerBuiltins([fakeBuiltin("silo.demo", "Demo")], new Set());
    await expect(mgr.update("silo.demo", consent)).rejects.toThrow(
      /update with the app/,
    );
    await expect(mgr.update("acme.gone", consent)).rejects.toThrow(
      /not installed/,
    );

    fsMap.set(
      INSTALLED,
      JSON.stringify({
        version: 1,
        extensions: [
          { id: "acme.x", dir: "acme.x", enabled: true, permissions: [] },
        ],
      }),
    );
    await expect(mgr.update("acme.x", consent)).rejects.toThrow(
      /before update support/,
    );
  });

  it("rejects when the source folder is gone or now declares a different id", async () => {
    await installV1();

    fsMap.set(
      "/src/ext/package.json",
      JSON.stringify({
        name: "Other",
        version: "1.0.0",
        silo: { id: "acme.y", main: "dist/index.js" },
      }),
    );
    await expect(mgr.update("acme.x", async () => true)).rejects.toThrow(
      /expected "acme.x"/,
    );
    // The failed attempt never touched the install.
    expect(fsMap.get(`${DEST}/dist/index.js`)).toBe("v1");

    for (const k of [...fsMap.keys()]) {
      if (k.startsWith("/src/ext/")) fsMap.delete(k);
    }
    await expect(mgr.update("acme.x", async () => true)).rejects.toThrow(
      /no longer exists/,
    );
  });
});

// ---- registry install + update (RFC 0014) --------------------------------

import { clearRegistryCache } from "./registry-client";

describe("installFromRegistry", () => {
  /** A registry index whose only entry is acme.x at `version`. */
  function registryFetch(version: string, sha256: string) {
    return vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        schemaVersion: 1,
        name: "test",
        generatedAt: "",
        extensions: [
          {
            id: "acme.x",
            description: "x",
            categories: ["productivity"],
            repo: "acme/x",
            status: "active",
            latest: {
              version,
              tarballUrl: `https://github.com/acme/x/releases/download/v${version}/x.tgz`,
              mirrorUrl: null,
              sha256,
              size: 1,
              engine: null,
              permissions: ["fs:read"],
              provenance: "none",
              publishedAt: "",
            },
            totalDownloads: 0,
            readme: "/readme/acme.x.md",
            detail: "/ext/acme.x.json",
          },
        ],
      }),
    });
  }

  function stageOnDownload() {
    invokeMock.mockImplementation(
      async (_cmd: string, args: { destDir?: string }) => {
        if (args.destDir) {
          fsMap.set(
            `${args.destDir}/package/package.json`,
            manifest(["fs:read"]),
          );
          fsMap.set(
            "/cfg/extensions/acme.x/package.json",
            manifest(["fs:read"]),
          );
        }
      },
    );
  }

  beforeEach(() => {
    clearRegistryCache();
  });

  it("passes the pinned digest to download_extract and records the registry source", async () => {
    global.fetch = registryFetch("1.0.0", "digest-1");
    stageOnDownload();

    await mgr.installFromRegistry("acme.x", async () => true);

    expect(invokeMock).toHaveBeenCalledWith(
      "download_extract",
      expect.objectContaining({
        url: "https://github.com/acme/x/releases/download/v1.0.0/x.tgz",
        expectedSha256: "digest-1",
      }),
    );
    expect(installedRecord()).toMatchObject({
      source: { kind: "registry", value: "acme.x" },
    });
  });

  it("rejects ids the registry does not list", async () => {
    global.fetch = registryFetch("1.0.0", "digest-1");
    await expect(
      mgr.installFromRegistry("acme.nope", async () => true),
    ).rejects.toThrow(/not in the registry/);
    expect(invokeMock).not.toHaveBeenCalledWith(
      "download_extract",
      expect.anything(),
    );
  });

  it("update() re-resolves a registry source through the index with the new digest", async () => {
    global.fetch = registryFetch("1.0.0", "digest-1");
    stageOnDownload();
    await mgr.installFromRegistry("acme.x", async () => true);

    // A new version lands in the registry.
    clearRegistryCache();
    global.fetch = registryFetch("1.1.0", "digest-2");

    await mgr.update("acme.x", async () => true);

    expect(invokeMock).toHaveBeenLastCalledWith(
      "download_extract",
      expect.objectContaining({
        url: "https://github.com/acme/x/releases/download/v1.1.0/x.tgz",
        expectedSha256: "digest-2",
      }),
    );
  });

  it("checkUpdates surfaces newer registry versions for installed rows", async () => {
    global.fetch = registryFetch("1.0.0", "digest-1");
    stageOnDownload();
    await mgr.installFromRegistry("acme.x", async () => true);

    clearRegistryCache();
    global.fetch = registryFetch("1.1.0", "digest-2");

    const updates = await mgr.checkUpdates();
    expect(updates).toEqual([
      expect.objectContaining({
        id: "acme.x",
        installedVersion: "1.0.0",
        latestVersion: "1.1.0",
      }),
    ]);
  });

  it("checkUpdates publishes the result onto reactive state for other UI to read", async () => {
    global.fetch = registryFetch("1.0.0", "digest-1");
    stageOnDownload();
    await mgr.installFromRegistry("acme.x", async () => true);

    clearRegistryCache();
    global.fetch = registryFetch("1.1.0", "digest-2");

    await mgr.checkUpdates();
    expect(mgr.getState().availableUpdates).toEqual([
      expect.objectContaining({ id: "acme.x" }),
    ]);

    // A subsequent refresh (install/uninstall/enable/disable) must not wipe
    // the last known update check.
    await mgr.disable("acme.x");
    expect(mgr.getState().availableUpdates).toEqual([
      expect.objectContaining({ id: "acme.x" }),
    ]);
  });
});

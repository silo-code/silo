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
}));

import {
  getExtensionManager,
  validateManifestPermissions,
} from "./extension-manager";

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
});

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

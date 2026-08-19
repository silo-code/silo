// Covers the registry client: index parsing (defensive against malformed
// entries), ETag caching, install resolution (mirror fallback, removed/
// unreleased errors), semver compare, and the update diff.

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  clearRegistryCache,
  compareVersions,
  fetchRegistryIndex,
  findUpdates,
  parseRegistryIndex,
  registryReadmeUrl,
  resolveRegistryInstall,
  type RegistryIndex,
} from "./registry-client";
import type { InstalledExtension } from "./extension-manager";

const latest = (version: string, extra: Record<string, unknown> = {}) => ({
  version,
  tarballUrl: `https://github.com/acme/x/releases/download/v${version}/x.tgz`,
  mirrorUrl: null,
  sha256: "abc123",
  size: 10,
  engine: "^0.17.0",
  permissions: ["network"],
  provenance: "none",
  publishedAt: "2026-07-13T00:00:00Z",
  ...extra,
});

const entry = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  description: `${id} does things`,
  categories: ["productivity"],
  repo: `acme/${id.split(".")[1]}`,
  status: "active",
  latest: latest("1.2.0"),
  totalDownloads: 5,
  readme: `/readme/${id}.md`,
  detail: `/ext/${id}.json`,
  ...extra,
});

function index(extensions: unknown[]): RegistryIndex {
  return parseRegistryIndex({
    schemaVersion: 1,
    name: "test",
    generatedAt: "2026-07-13T00:00:00Z",
    extensions,
  });
}

const row = (over: Partial<InstalledExtension>): InstalledExtension => ({
  id: "acme.weather",
  name: "Weather",
  version: "1.0.0",
  publisher: "acme",
  enabled: true,
  loaded: true,
  builtin: false,
  permissions: ["network"],
  hostVersion: "1.0.0",
  engineCompatible: true,
  source: { kind: "registry", value: "acme.weather" },
  ...over,
});

describe("parseRegistryIndex", () => {
  it("parses valid entries and defaults optional fields", () => {
    const idx = index([entry("acme.weather")]);
    expect(idx.extensions).toHaveLength(1);
    expect(idx.extensions[0].latest?.version).toBe("1.2.0");
    expect(idx.extensions[0].status).toBe("active");
  });

  it("drops malformed entries instead of failing the catalog", () => {
    const idx = index([
      entry("acme.weather"),
      { id: 42 },
      "garbage",
      entry("acme.clock", { latest: { version: "1.0.0" } }), // missing tarball/sha → latest null
    ]);
    expect(idx.extensions.map((e) => e.id)).toEqual([
      "acme.weather",
      "acme.clock",
    ]);
    expect(idx.extensions[1].latest).toBeNull();
  });

  it("throws when there is no extensions array at all", () => {
    expect(() => parseRegistryIndex({})).toThrow(/malformed/);
    expect(() => parseRegistryIndex(null)).toThrow(/malformed/);
  });
});

describe("fetchRegistryIndex (ETag cache)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    clearRegistryCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("caches by ETag and serves the cached index on 304", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ etag: '"v1"' }),
      json: async () => ({ extensions: [entry("acme.weather")] }),
    });
    const first = await fetchRegistryIndex("https://r.example");
    expect(first.extensions).toHaveLength(1);

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 304,
      headers: new Headers(),
    });
    const second = await fetchRegistryIndex("https://r.example");
    expect(second).toBe(first);
    expect(fetchMock.mock.calls[1][1].headers["if-none-match"]).toBe('"v1"');
  });

  it("throws a readable error on HTTP failure", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: new Headers(),
    });
    await expect(fetchRegistryIndex("https://r.example")).rejects.toThrow(
      /HTTP 500/,
    );
  });
});

describe("resolveRegistryInstall", () => {
  it("resolves the pinned tarball for an active extension", () => {
    const r = resolveRegistryInstall(
      index([entry("acme.weather")]),
      "acme.weather",
    );
    expect(r).toEqual({
      url: "https://github.com/acme/x/releases/download/v1.2.0/x.tgz",
      sha256: "abc123",
      version: "1.2.0",
    });
  });

  it("falls back to the mirror when the upstream is unavailable", () => {
    const idx = index([
      entry("acme.weather", {
        status: "unavailable",
        latest: latest("1.2.0", { mirrorUrl: "https://mirror.example/x.tgz" }),
      }),
    ]);
    expect(resolveRegistryInstall(idx, "acme.weather").url).toBe(
      "https://mirror.example/x.tgz",
    );
  });

  it("errors for unknown, removed, and unreleased extensions", () => {
    const idx = index([
      entry("acme.removed", { status: "removed" }),
      entry("acme.unreleased", { latest: null }),
    ]);
    expect(() => resolveRegistryInstall(idx, "acme.nope")).toThrow(
      /not in the registry/,
    );
    expect(() => resolveRegistryInstall(idx, "acme.removed")).toThrow(
      /removed/,
    );
    expect(() => resolveRegistryInstall(idx, "acme.unreleased")).toThrow(
      /no published release/,
    );
  });
});

describe("compareVersions", () => {
  it("orders semver correctly, prereleases before releases", () => {
    expect(compareVersions("0.10.0", "0.9.9")).toBeGreaterThan(0);
    expect(compareVersions("1.0.0-beta", "1.0.0")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });
});

describe("findUpdates", () => {
  it("reports a newer registry version, with permission-widening flagged", () => {
    const idx = index([
      entry("acme.weather", {
        latest: latest("1.1.0", { permissions: ["network", "fs:write"] }),
      }),
    ]);
    const updates = findUpdates([row({})], idx);
    expect(updates).toEqual([
      {
        id: "acme.weather",
        name: "Weather",
        installedVersion: "1.0.0",
        latestVersion: "1.1.0",
        widensPermissions: true,
      },
    ]);
  });

  it("is quiet when up to date, and ignores non-registry sources", () => {
    const idx = index([entry("acme.weather", { latest: latest("1.0.0") })]);
    expect(findUpdates([row({})], idx)).toEqual([]);
    // Newer version exists, but the row came from a folder → no upstream.
    const newer = index([entry("acme.weather", { latest: latest("2.0.0") })]);
    expect(
      findUpdates([row({ source: { kind: "folder", value: "/src" } })], newer),
    ).toEqual([]);
    // Registry row that the index no longer lists → nothing to offer.
    expect(findUpdates([row({})], index([]))).toEqual([]);
  });

  it("skips an update whose engine floor is above the running host", () => {
    const idx = index([
      entry("acme.weather", { latest: latest("2.0.0", { engine: "^0.50.0" }) }),
    ]);
    expect(findUpdates([row({ hostVersion: "0.49.0" })], idx)).toEqual([]);
  });

  it("offers that same update once the host meets the floor", () => {
    const idx = index([
      entry("acme.weather", { latest: latest("2.0.0", { engine: "^0.50.0" }) }),
    ]);
    expect(
      findUpdates([row({ hostVersion: "0.50.0" })], idx).map(
        (u) => u.latestVersion,
      ),
    ).toEqual(["2.0.0"]);
  });

  it("treats a missing engine as unconstrained", () => {
    const idx = index([
      entry("acme.weather", { latest: latest("2.0.0", { engine: null }) }),
    ]);
    expect(
      findUpdates([row({ hostVersion: "0.1.0" })], idx).map(
        (u) => u.latestVersion,
      ),
    ).toEqual(["2.0.0"]);
  });

  it("treats an unparsable host version as unconstrained", () => {
    // appVersion() failing leaves hostVersion "" — don't hide updates over it.
    const idx = index([
      entry("acme.weather", { latest: latest("2.0.0", { engine: "^0.50.0" }) }),
    ]);
    expect(
      findUpdates([row({ hostVersion: "" })], idx).map((u) => u.latestVersion),
    ).toEqual(["2.0.0"]);
  });
});

describe("registryReadmeUrl", () => {
  it("joins the registry base with the entry's readme path", () => {
    expect(
      registryReadmeUrl({ readme: "/readme/a.b.md" }, "https://r.example"),
    ).toBe("https://r.example/readme/a.b.md");
  });
});

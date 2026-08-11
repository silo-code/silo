// Covers the changelog client: ETag caching, malformed-entry filtering, and
// the installed→available version-range slice used by the update modal.

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  changelogRange,
  clearChangelogCache,
  fetchChangelog,
  type ChangelogEntry,
} from "./changelog-client";

const entry = (
  version: string,
  extra: Partial<ChangelogEntry> = {},
): ChangelogEntry => ({
  version,
  date: "2026-08-01",
  body: `notes for ${version}`,
  ...extra,
});

describe("fetchChangelog (ETag cache)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    clearChangelogCache();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("caches by ETag and serves the cached entries on 304", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers({ etag: '"v1"' }),
      json: async () => ({ schemaVersion: 1, entries: [entry("1.1.0")] }),
    });
    const first = await fetchChangelog("https://c.example/changelog.json");
    expect(first).toHaveLength(1);

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 304,
      headers: new Headers(),
    });
    const second = await fetchChangelog("https://c.example/changelog.json");
    expect(second).toBe(first);
    expect(fetchMock.mock.calls[1][1].headers["if-none-match"]).toBe('"v1"');
  });

  it("drops malformed entries instead of failing the whole fetch", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({
        schemaVersion: 1,
        entries: [
          entry("1.1.0"),
          { version: 42 },
          "garbage",
          { body: "no version" },
        ],
      }),
    });
    const entries = await fetchChangelog("https://c.example/changelog.json");
    expect(entries.map((e) => e.version)).toEqual(["1.1.0"]);
  });

  it("throws a readable error on HTTP failure", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: new Headers(),
    });
    await expect(
      fetchChangelog("https://c.example/changelog.json"),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("throws when the payload has no entries array", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      headers: new Headers(),
      json: async () => ({ oops: true }),
    });
    await expect(
      fetchChangelog("https://c.example/changelog.json"),
    ).rejects.toThrow(/malformed/);
  });
});

describe("changelogRange", () => {
  const entries = [
    entry("1.3.0"),
    entry("1.2.0"),
    entry("1.1.0"),
    entry("1.0.0"),
  ];

  it("includes versions strictly newer than installed, up to and including available", () => {
    expect(
      changelogRange(entries, "1.0.0", "1.2.0").map((e) => e.version),
    ).toEqual(["1.2.0", "1.1.0"]);
  });

  it("excludes the installed version itself", () => {
    expect(changelogRange(entries, "1.1.0", "1.1.0")).toEqual([]);
  });

  it("returns entries newest-first regardless of input order", () => {
    const shuffled = [entries[2], entries[0], entries[1], entries[3]];
    expect(
      changelogRange(shuffled, "1.0.0", "1.3.0").map((e) => e.version),
    ).toEqual(["1.3.0", "1.2.0", "1.1.0"]);
  });

  it("returns an empty range when installed is already at or past available", () => {
    expect(changelogRange(entries, "1.3.0", "1.2.0")).toEqual([]);
  });
});

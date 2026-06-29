import { describe, it, expect } from "vitest";
import {
  filterEntries,
  formatTimestamp,
  channelOptions,
  copyEntries,
  type OutputFilter,
} from "./output-model";
import type { OutputEntry } from "@silo-code/extension-host/internal";

function entry(
  id: number,
  level: OutputEntry["level"],
  message: string,
): OutputEntry {
  return { id, level, message, timestamp: 0 };
}

describe("filterEntries", () => {
  const entries: OutputEntry[] = [
    entry(0, "debug", "connecting"),
    entry(1, "info", "connected"),
    entry(2, "warn", "slow response"),
    entry(3, "error", "connection failed"),
    entry(4, "info", "retrying connection"),
  ];

  it("returns same array reference when filter is all+empty", () => {
    const filter: OutputFilter = { level: "all", search: "" };
    expect(filterEntries(entries, filter)).toBe(entries);
  });

  it("filters by level", () => {
    const result = filterEntries(entries, { level: "info", search: "" });
    expect(result.map((e) => e.id)).toEqual([1, 4]);
  });

  it("excludes all entries when level matches nothing", () => {
    const result = filterEntries([entry(0, "debug", "x")], {
      level: "error",
      search: "",
    });
    expect(result).toHaveLength(0);
  });

  it("filters by case-insensitive substring search", () => {
    const result = filterEntries(entries, { level: "all", search: "CONN" });
    expect(result.map((e) => e.id)).toEqual([0, 1, 3, 4]);
  });

  it("partial match passes", () => {
    const result = filterEntries(entries, { level: "all", search: "slow" });
    expect(result.map((e) => e.id)).toEqual([2]);
  });

  it("both dims active — entry must satisfy both", () => {
    const result = filterEntries(entries, { level: "info", search: "retry" });
    expect(result.map((e) => e.id)).toEqual([4]);
  });

  it("entry that fails level is excluded even if search matches", () => {
    const result = filterEntries(entries, {
      level: "warn",
      search: "connection",
    });
    expect(result).toHaveLength(0);
  });

  it("returns empty array for empty entries", () => {
    expect(filterEntries([], { level: "all", search: "" })).toHaveLength(0);
  });
});

describe("formatTimestamp", () => {
  it("formats midnight as 00:00:00", () => {
    const midnight = new Date("2024-01-01T00:00:00").getTime();
    expect(formatTimestamp(midnight)).toBe("00:00:00");
  });

  it("formats noon as 12:00:00", () => {
    const noon = new Date("2024-01-01T12:00:00").getTime();
    expect(formatTimestamp(noon)).toBe("12:00:00");
  });

  it("formats end-of-day as 23:59:59", () => {
    const eod = new Date("2024-01-01T23:59:59").getTime();
    expect(formatTimestamp(eod)).toBe("23:59:59");
  });

  it("zero-pads single-digit hours, minutes, and seconds", () => {
    const ts = new Date("2024-01-01T03:07:09").getTime();
    expect(formatTimestamp(ts)).toBe("03:07:09");
  });

  it("produces a HH:MM:SS shaped string", () => {
    const ts = Date.now();
    expect(formatTimestamp(ts)).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });
});

describe("copyEntries", () => {
  const ts = new Date("2024-01-01T10:30:00").getTime();

  it("formats a single info entry", () => {
    const entries = [
      { id: 1, level: "info" as const, message: "hello", timestamp: ts },
    ];
    expect(copyEntries(entries)).toBe("10:30:00 [INFO ] hello");
  });

  it("pads level to 5 chars", () => {
    const e = (level: "debug" | "info" | "warn" | "error") => ({
      id: 1,
      level,
      message: "x",
      timestamp: ts,
    });
    expect(copyEntries([e("debug")])).toContain("[DEBUG]");
    expect(copyEntries([e("info")])).toContain("[INFO ]");
    expect(copyEntries([e("warn")])).toContain("[WARN ]");
    expect(copyEntries([e("error")])).toContain("[ERROR]");
  });

  it("appends string data on next line", () => {
    const entries = [
      {
        id: 1,
        level: "info" as const,
        message: "msg",
        timestamp: ts,
        data: "extra info",
      },
    ];
    expect(copyEntries(entries)).toBe("10:30:00 [INFO ] msg\nextra info");
  });

  it("serialises object data as JSON", () => {
    const entries = [
      {
        id: 1,
        level: "info" as const,
        message: "msg",
        timestamp: ts,
        data: { a: 1 },
      },
    ];
    const result = copyEntries(entries);
    expect(result).toContain("{\n");
    expect(result).toContain('"a": 1');
  });

  it("joins multiple entries with newlines", () => {
    const entries = [
      { id: 1, level: "info" as const, message: "first", timestamp: ts },
      { id: 2, level: "warn" as const, message: "second", timestamp: ts },
    ];
    const lines = copyEntries(entries).split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("first");
    expect(lines[1]).toContain("second");
  });

  it("returns empty string for empty array", () => {
    expect(copyEntries([])).toBe("");
  });
});

describe("channelOptions", () => {
  it("splits by silo: prefix and builtin flag", () => {
    const channels = {
      "silo:notifications": {
        key: "silo:notifications",
        displayName: "Notifications",
        entries: [],
      },
      "ext:silo.git": {
        key: "ext:silo.git",
        displayName: "Git",
        entries: [],
        builtin: true,
      },
      "ext:acme.foo": {
        key: "ext:acme.foo",
        displayName: "Foo",
        entries: [],
        builtin: false,
      },
    };
    const order = ["silo:notifications", "ext:silo.git", "ext:acme.foo"];
    const result = channelOptions(channels, order);
    expect(result.host).toEqual([
      { key: "silo:notifications", displayName: "Notifications" },
    ]);
    expect(result.builtinExtensions).toEqual([
      { key: "ext:silo.git", displayName: "Git" },
    ]);
    expect(result.extensions).toEqual([
      { key: "ext:acme.foo", displayName: "Foo" },
    ]);
  });

  it("a silo.* ext without builtin flag goes into extensions, not builtinExtensions", () => {
    const channels = {
      "ext:silo.docs-panel": {
        key: "ext:silo.docs-panel",
        displayName: "silo.docs-panel",
        entries: [],
      },
    };
    const result = channelOptions(channels, ["ext:silo.docs-panel"]);
    expect(result.builtinExtensions).toHaveLength(0);
    expect(result.extensions).toHaveLength(1);
  });

  it("skips keys missing from channels", () => {
    const channels = {
      "ext:acme.bar": { key: "ext:acme.bar", displayName: "Bar", entries: [] },
    };
    const order = ["silo:notifications", "ext:silo.git", "ext:acme.bar"];
    const result = channelOptions(channels, order);
    expect(result.host).toHaveLength(0);
    expect(result.builtinExtensions).toHaveLength(0);
    expect(result.extensions).toHaveLength(1);
    expect(result.extensions[0].key).toBe("ext:acme.bar");
  });

  it("returns empty groups for empty inputs", () => {
    expect(channelOptions({}, [])).toEqual({
      host: [],
      builtinExtensions: [],
      extensions: [],
    });
  });

  it("preserves insertion order within each group", () => {
    const channels = {
      "silo:b": { key: "silo:b", displayName: "B", entries: [] },
      "silo:a": { key: "silo:a", displayName: "A", entries: [] },
      "ext:silo.y": {
        key: "ext:silo.y",
        displayName: "Y",
        entries: [],
        builtin: true,
      },
      "ext:silo.z": {
        key: "ext:silo.z",
        displayName: "Z",
        entries: [],
        builtin: true,
      },
      "ext:vendor.p": { key: "ext:vendor.p", displayName: "P", entries: [] },
      "ext:vendor.q": { key: "ext:vendor.q", displayName: "Q", entries: [] },
    };
    const order = [
      "silo:a",
      "silo:b",
      "ext:silo.y",
      "ext:silo.z",
      "ext:vendor.p",
      "ext:vendor.q",
    ];
    const result = channelOptions(channels, order);
    expect(result.host.map((c) => c.key)).toEqual(["silo:a", "silo:b"]);
    expect(result.builtinExtensions.map((c) => c.key)).toEqual([
      "ext:silo.y",
      "ext:silo.z",
    ]);
    expect(result.extensions.map((c) => c.key)).toEqual([
      "ext:vendor.p",
      "ext:vendor.q",
    ]);
  });

  it("handles only host channels", () => {
    const channels = {
      "silo:app": { key: "silo:app", displayName: "Application", entries: [] },
    };
    const result = channelOptions(channels, ["silo:app"]);
    expect(result.host).toHaveLength(1);
    expect(result.builtinExtensions).toHaveLength(0);
    expect(result.extensions).toHaveLength(0);
  });

  it("handles only third-party extensions", () => {
    const channels = {
      "ext:acme.main": {
        key: "ext:acme.main",
        displayName: "Acme",
        entries: [],
        builtin: false,
      },
    };
    const result = channelOptions(channels, ["ext:acme.main"]);
    expect(result.host).toHaveLength(0);
    expect(result.builtinExtensions).toHaveLength(0);
    expect(result.extensions).toHaveLength(1);
  });
});

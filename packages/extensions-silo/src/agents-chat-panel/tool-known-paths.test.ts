import { describe, expect, it } from "vitest";
import { toolKnownPaths } from "./tool-known-paths";
import type { ToolEntry } from "./transcript-model";

function entry(overrides: Partial<ToolEntry> = {}): ToolEntry {
  return {
    type: "tool",
    key: "k1",
    toolCallId: "c1",
    title: "Edit",
    status: "completed",
    lines: [],
    ...overrides,
  };
}

describe("toolKnownPaths", () => {
  it("puts the protocol's locations first", () => {
    const e = entry({
      locations: [{ path: "/a/My Notes/b.md" }],
      diffs: [{ path: "src/b.md", oldText: "", newText: "" }],
      rawInput: { file_path: "src/b.md" },
    });
    expect(toolKnownPaths(e)).toEqual(["/a/My Notes/b.md", "src/b.md"]);
  });

  it("falls back to the call's own diff and input", () => {
    expect(toolKnownPaths(entry({ rawInput: { path: "src/a.ts" } }))).toEqual([
      "src/a.ts",
    ]);
    expect(toolKnownPaths(entry())).toEqual([]);
  });

  it("returns the same array for the same entry", () => {
    // `LinkifiedText` is memoized on this array's identity, so a fresh one
    // every render would re-run the matcher for every tool row (RFC 0050).
    const e = entry({ locations: [{ path: "/a/b.md" }] });
    expect(toolKnownPaths(e)).toBe(toolKnownPaths(e));
  });
});

import { describe, it, expect } from "vitest";
import {
  diffFileName,
  diffHeading,
  diffLines,
  diffStats,
  resolveToolDiffs,
  toolDiffFromRawInput,
  toolDiffsFromContent,
  toolInputIsDiffOnly,
  toolShowsInlineDiff,
} from "./tool-diff";

describe("toolDiffsFromContent", () => {
  it("keeps oldText and newText from a protocol diff block", () => {
    expect(
      toolDiffsFromContent([
        { type: "diff", path: "src/a.ts", oldText: "a\n", newText: "b\n" },
      ]),
    ).toEqual([{ path: "src/a.ts", oldText: "a\n", newText: "b\n" }]);
  });

  it("skips a create — new file, no previous text", () => {
    expect(
      toolDiffsFromContent([
        { type: "diff", path: "NEW.md", newText: "hello\n" },
      ]),
    ).toEqual([]);
  });

  it("skips a path-only diff and non-diff blocks", () => {
    expect(
      toolDiffsFromContent([
        { type: "diff", path: "src/a.ts" },
        { type: "content", content: { type: "text", text: "ok" } },
      ]),
    ).toEqual([]);
  });
});

describe("toolDiffFromRawInput", () => {
  it("reads Claude Edit's old_string / new_string / file_path", () => {
    expect(
      toolDiffFromRawInput({
        file_path: "/tmp/a.ts",
        old_string: "foo",
        new_string: "bar",
      }),
    ).toEqual({ path: "/tmp/a.ts", oldText: "foo", newText: "bar" });
  });

  it("returns nothing for a Write with only new text", () => {
    expect(
      toolDiffFromRawInput({ file_path: "NEW.md", new_string: "hello" }),
    ).toBeUndefined();
  });

  it("returns nothing when the input is a shell command", () => {
    expect(toolDiffFromRawInput({ command: "ls" })).toBeUndefined();
    expect(toolDiffFromRawInput("ls")).toBeUndefined();
  });
});

describe("resolveToolDiffs", () => {
  it("prefers a protocol diff over rawInput", () => {
    const diffs = resolveToolDiffs(
      [{ type: "diff", path: "a.ts", oldText: "x", newText: "y" }],
      { file_path: "b.ts", old_string: "1", new_string: "2" },
    );
    expect(diffs).toEqual([{ path: "a.ts", oldText: "x", newText: "y" }]);
  });

  it("falls back to rawInput when content has no usable diff", () => {
    const diffs = resolveToolDiffs(
      [{ type: "content", content: { type: "text", text: "updated" } }],
      { file_path: "b.ts", old_string: "1", new_string: "2" },
    );
    expect(diffs).toEqual([{ path: "b.ts", oldText: "1", newText: "2" }]);
  });
});

describe("toolShowsInlineDiff", () => {
  it("is only for edit rows that already have a hunk", () => {
    expect(toolShowsInlineDiff("edit", 1)).toBe(true);
    expect(toolShowsInlineDiff("EDIT", 2)).toBe(true);
    expect(toolShowsInlineDiff("edit", 0)).toBe(false);
    expect(toolShowsInlineDiff("execute", 1)).toBe(false);
    expect(toolShowsInlineDiff(undefined, 1)).toBe(false);
  });
});

describe("toolInputIsDiffOnly", () => {
  it("is true for an Edit-shaped object and false otherwise", () => {
    expect(
      toolInputIsDiffOnly({
        file_path: "a.ts",
        old_string: "a",
        new_string: "b",
      }),
    ).toBe(true);
    expect(toolInputIsDiffOnly({ command: "ls", path: "a.ts" })).toBe(false);
  });
});

describe("diffLines", () => {
  it("keeps a few unchanged lines around a replacement", () => {
    const oldText = ["one", "two", "old", "three", "four"].join("\n");
    const newText = ["one", "two", "new", "three", "four"].join("\n");
    expect(diffLines(oldText, newText)).toEqual([
      { kind: "eq", text: "one", line: 1 },
      { kind: "eq", text: "two", line: 2 },
      { kind: "del", text: "old", line: 3 },
      { kind: "add", text: "new", line: 3 },
      { kind: "eq", text: "three", line: 4 },
      { kind: "eq", text: "four", line: 5 },
    ]);
  });

  it("caps leading context at three lines and keeps file line numbers", () => {
    const oldText = ["a", "b", "c", "d", "old", "z"].join("\n");
    const newText = ["a", "b", "c", "d", "new", "z"].join("\n");
    expect(diffLines(oldText, newText)).toEqual([
      { kind: "eq", text: "b", line: 2 },
      { kind: "eq", text: "c", line: 3 },
      { kind: "eq", text: "d", line: 4 },
      { kind: "del", text: "old", line: 5 },
      { kind: "add", text: "new", line: 5 },
      { kind: "eq", text: "z", line: 6 },
    ]);
  });

  it("treats a create as all additions", () => {
    expect(diffLines("", "hi\nthere")).toEqual([
      { kind: "add", text: "hi", line: 1 },
      { kind: "add", text: "there", line: 2 },
    ]);
  });
});

describe("diffHeading", () => {
  it("names the file and the +/- counts", () => {
    const lines = diffLines("a\nb\n", "a\nc\n");
    expect(
      diffHeading(
        {
          path: "src/tool-display.test.ts",
          oldText: "a\nb\n",
          newText: "a\nc\n",
        },
        lines,
      ),
    ).toBe("Edited tool-display.test.ts +1 -1");
  });

  it("says Created when there was no previous text", () => {
    const lines = diffLines("", "hello");
    expect(
      diffHeading({ path: "NEW.md", oldText: "", newText: "hello" }, lines),
    ).toBe("Created NEW.md +1");
  });
});

describe("diffStats / diffFileName", () => {
  it("counts add and del only", () => {
    expect(
      diffStats([
        { kind: "eq", text: "x", line: 1 },
        { kind: "del", text: "a", line: 2 },
        { kind: "add", text: "b", line: 2 },
      ]),
    ).toEqual({
      added: 1,
      removed: 1,
    });
  });

  it("takes the last path segment", () => {
    expect(diffFileName("/Users/me/src/a.ts")).toBe("a.ts");
    expect(diffFileName(undefined)).toBe("file");
  });
});

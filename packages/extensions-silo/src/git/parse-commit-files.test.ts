import { describe, it, expect } from "vitest";
import {
  EMPTY_TREE_HASH,
  mergeCommitFiles,
  parseNameStatus,
  parseNumstat,
  resolveDiffBase,
} from "./parse-commit-files";

describe("resolveDiffBase", () => {
  it("uses the first parent for an ordinary or merge commit", () => {
    expect(resolveDiffBase(["p1"])).toBe("p1");
    expect(resolveDiffBase(["p1", "p2"])).toBe("p1");
  });

  it("falls back to the empty tree for a root commit (no parents)", () => {
    expect(resolveDiffBase([])).toBe(EMPTY_TREE_HASH);
  });
});

describe("parseNameStatus", () => {
  it("parses added/modified/deleted rows", () => {
    const raw = "A\tnew.txt\nM\tchanged.txt\nD\tgone.txt\n";
    expect(parseNameStatus(raw)).toEqual([
      { path: "new.txt", status: "A" },
      { path: "changed.txt", status: "M" },
      { path: "gone.txt", status: "D" },
    ]);
  });

  it("parses a rename row with its similarity-scored status letter", () => {
    const raw = "R100\told/path.ts\tnew/path.ts\n";
    expect(parseNameStatus(raw)).toEqual([
      { path: "new/path.ts", origPath: "old/path.ts", status: "R" },
    ]);
  });

  it("ignores blank lines", () => {
    expect(parseNameStatus("\nA\tfoo\n\n")).toEqual([
      { path: "foo", status: "A" },
    ]);
  });
});

describe("parseNumstat", () => {
  it("parses addition/deletion counts", () => {
    expect(parseNumstat("12\t3\tfoo.ts\n")).toEqual([
      { path: "foo.ts", additions: 12, deletions: 3 },
    ]);
  });

  it("reports binary files as null counts (git's `-\\t-` marker)", () => {
    expect(parseNumstat("-\t-\timage.png\n")).toEqual([
      { path: "image.png", additions: null, deletions: null },
    ]);
  });
});

describe("mergeCommitFiles", () => {
  it("attaches numstat counts to name-status rows by path", () => {
    const result = mergeCommitFiles(
      [{ path: "a.ts", status: "M" }],
      [{ path: "a.ts", additions: 5, deletions: 1 }],
    );
    expect(result).toEqual([
      {
        path: "a.ts",
        origPath: undefined,
        status: "M",
        binary: false,
        additions: 5,
        deletions: 1,
      },
    ]);
  });

  it("flags binary when numstat reports null counts for the path", () => {
    const result = mergeCommitFiles(
      [{ path: "logo.png", status: "A" }],
      [{ path: "logo.png", additions: null, deletions: null }],
    );
    expect(result[0]).toMatchObject({ binary: true, additions: null });
  });

  it("falls back to the rename's origPath when only the delete-side numstat row exists", () => {
    // A plain (no -M) numstat run reports a rename as delete(old)+add(new);
    // if the add-side row is missing for some reason, origPath still resolves.
    const result = mergeCommitFiles(
      [{ path: "new.ts", origPath: "old.ts", status: "R" }],
      [{ path: "old.ts", additions: 0, deletions: 10 }],
    );
    expect(result[0]).toMatchObject({ additions: 0, deletions: 10 });
  });

  it("resolves stats as null (not binary) when neither path is found in numstat", () => {
    const result = mergeCommitFiles(
      [{ path: "untracked-in-numstat.ts", status: "M" }],
      [],
    );
    expect(result[0]).toMatchObject({
      binary: false,
      additions: null,
      deletions: null,
    });
  });
});

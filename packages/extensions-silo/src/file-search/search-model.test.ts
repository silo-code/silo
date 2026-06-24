import { describe, it, expect } from "vitest";
import {
  buildSearchOptions,
  clampPreviewStart,
  highlightSegments,
  parseGlobs,
  summarize,
  EMPTY_UI_STATE,
} from "./search-model";

describe("parseGlobs", () => {
  it("splits, trims, and drops empties", () => {
    expect(parseGlobs(" *.ts , src/** ,, ")).toEqual(["*.ts", "src/**"]);
  });
  it("returns [] for a blank field", () => {
    expect(parseGlobs("   ")).toEqual([]);
  });
});

describe("buildSearchOptions", () => {
  it("maps UI controls + globs into the SDK payload for a single folder", () => {
    const opts = buildSearchOptions(
      {
        ...EMPTY_UI_STATE,
        query: "x",
        regex: true,
        caseSensitive: true,
        wholeWord: true,
        includes: "*.ts",
        excludes: "dist/**, *.min.js",
      },
      ["/repo"],
    );
    expect(opts).toEqual({
      cwds: ["/repo"],
      regex: true,
      caseSensitive: true,
      wholeWord: true,
      includeGlobs: ["*.ts"],
      excludeGlobs: ["dist/**", "*.min.js"],
    });
  });

  it("passes all folders as cwds when enabledFolders is null", () => {
    const opts = buildSearchOptions(
      { ...EMPTY_UI_STATE, enabledFolders: null },
      ["/repo/a", "/repo/b", "/repo/c"],
    );
    expect(opts.cwds).toEqual(["/repo/a", "/repo/b", "/repo/c"]);
  });

  it("filters cwds to only enabled folders", () => {
    const opts = buildSearchOptions(
      { ...EMPTY_UI_STATE, enabledFolders: ["/repo/a", "/repo/c"] },
      ["/repo/a", "/repo/b", "/repo/c"],
    );
    expect(opts.cwds).toEqual(["/repo/a", "/repo/c"]);
  });

  it("falls back to all folders when enabledFolders filters to empty", () => {
    // This guards against a user somehow ending up with no folders selected.
    const opts = buildSearchOptions(
      { ...EMPTY_UI_STATE, enabledFolders: ["/repo/x"] },
      ["/repo/a", "/repo/b"],
    );
    expect(opts.cwds).toEqual(["/repo/a", "/repo/b"]);
  });

  it("treats undefined enabledFolders (migrating from pre-field stored state) as all folders", () => {
    const opts = buildSearchOptions(
      // Cast to simulate a stored state written before enabledFolders existed.
      { ...EMPTY_UI_STATE, enabledFolders: undefined as unknown as null },
      ["/repo/a", "/repo/b"],
    );
    expect(opts.cwds).toEqual(["/repo/a", "/repo/b"]);
  });
});

describe("highlightSegments", () => {
  it("returns a single plain segment when there are no ranges", () => {
    expect(highlightSegments("hello", [])).toEqual([
      { text: "hello", match: false },
    ]);
  });

  it("splits a single match into plain/match/plain", () => {
    expect(highlightSegments("a tokyo b", [[2, 7]])).toEqual([
      { text: "a ", match: false },
      { text: "tokyo", match: true },
      { text: " b", match: false },
    ]);
  });

  it("handles a match at the very start and end", () => {
    expect(highlightSegments("abc", [[0, 3]])).toEqual([
      { text: "abc", match: true },
    ]);
  });

  it("sorts unsorted ranges and supports multiple matches", () => {
    expect(
      highlightSegments("a.b.c", [
        [3, 4],
        [1, 2],
      ]),
    ).toEqual([
      { text: "a", match: false },
      { text: ".", match: true },
      { text: "b", match: false },
      { text: ".", match: true },
      { text: "c", match: false },
    ]);
  });

  it("merges overlapping ranges without duplicating text", () => {
    expect(
      highlightSegments("abcdef", [
        [1, 4],
        [2, 5],
      ]),
    ).toEqual([
      { text: "a", match: false },
      { text: "bcde", match: true },
      { text: "f", match: false },
    ]);
  });

  it("clamps out-of-bounds and zero-width ranges", () => {
    expect(
      highlightSegments("abc", [
        [1, 99],
        [2, 2],
      ]),
    ).toEqual([
      { text: "a", match: false },
      { text: "bc", match: true },
    ]);
  });
});

describe("clampPreviewStart", () => {
  it("leaves a line alone when the match is already near the start", () => {
    expect(clampPreviewStart("a tokyo b", [[2, 7]])).toEqual({
      preview: "a tokyo b",
      ranges: [[2, 7]],
    });
  });

  it("trims the start and shifts ranges when the match is far in", () => {
    // first match at index 30; lead=8 → cut 22 chars, prepend "…" (1 char),
    // so the match lands at 8 + ellipsis(1) = 9.
    const line = "x".repeat(30) + "MATCH" + " tail";
    const { preview, ranges } = clampPreviewStart(line, [[30, 35]], 8);
    expect(preview).toBe("…" + "x".repeat(8) + "MATCH" + " tail");
    expect(ranges).toEqual([[9, 14]]);
    // the highlighted slice still maps to the match text
    expect(preview.slice(9, 14)).toBe("MATCH");
  });

  it("shifts every range, not just the first", () => {
    const line = "y".repeat(20) + "aa" + "z".repeat(5) + "bb";
    // matches at [20,22] and [27,29]; lead=4 → cut 16
    const { preview, ranges } = clampPreviewStart(
      line,
      [
        [20, 22],
        [27, 29],
      ],
      4,
    );
    expect(preview.slice(ranges[0][0], ranges[0][1])).toBe("aa");
    expect(preview.slice(ranges[1][0], ranges[1][1])).toBe("bb");
  });

  it("is a no-op with no ranges", () => {
    expect(clampPreviewStart("just text", [])).toEqual({
      preview: "just text",
      ranges: [],
    });
  });
});

describe("summarize", () => {
  it("reports no results", () => {
    expect(summarize(0, 0)).toBe("No results");
  });
  it("singularizes one result in one file", () => {
    expect(summarize(1, 1)).toBe("1 result in 1 file");
  });
  it("pluralizes many results across files", () => {
    expect(summarize(24, 22)).toBe("24 results in 22 files");
  });
  it("flags truncation", () => {
    expect(summarize(5000, 800, true)).toBe(
      "5000 results in 800 files (truncated)",
    );
  });
});

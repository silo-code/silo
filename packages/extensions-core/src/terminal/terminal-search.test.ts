import { describe, it, expect } from "vitest";
import {
  buildSearchOptions,
  formatMatchCount,
  rgbToHex,
  blendOver,
  isLightColor,
  DEFAULT_SEARCH_FLAGS,
} from "./terminal-search";

const DECO = { match: "#aabbcc80", activeMatch: "#112233cc", ruler: "#445566" };

describe("formatMatchCount", () => {
  it("is empty when the query is empty (idle)", () => {
    expect(formatMatchCount("", null)).toBe("");
    expect(formatMatchCount("", { resultIndex: 3, resultCount: 9 })).toBe("");
  });

  it("reports no results when a non-empty query matched nothing", () => {
    expect(formatMatchCount("foo", null)).toBe("No results");
    expect(formatMatchCount("foo", { resultIndex: -1, resultCount: 0 })).toBe(
      "No results",
    );
  });

  it("reports the 1-based position of the active match", () => {
    expect(formatMatchCount("foo", { resultIndex: 0, resultCount: 12 })).toBe(
      "1 of 12",
    );
    expect(formatMatchCount("foo", { resultIndex: 11, resultCount: 12 })).toBe(
      "12 of 12",
    );
  });

  it("reports a bare count when the result set exceeds the threshold", () => {
    // SearchAddon sets resultIndex to -1 (no single active match) but still
    // gives a positive count.
    expect(formatMatchCount("a", { resultIndex: -1, resultCount: 5000 })).toBe(
      "5000 matches",
    );
  });
});

describe("buildSearchOptions", () => {
  it("maps the toggle flags straight through", () => {
    const opts = buildSearchOptions(
      { caseSensitive: true, wholeWord: true, regex: true },
      DECO,
      false,
    );
    expect(opts.caseSensitive).toBe(true);
    expect(opts.wholeWord).toBe(true);
    expect(opts.regex).toBe(true);
    expect(opts.incremental).toBe(false);
  });

  it("defaults are all off", () => {
    const opts = buildSearchOptions(DEFAULT_SEARCH_FLAGS, DECO, true);
    expect(opts.caseSensitive).toBe(false);
    expect(opts.wholeWord).toBe(false);
    expect(opts.regex).toBe(false);
    expect(opts.incremental).toBe(true);
  });

  it("always enables decorations so the count can update", () => {
    const opts = buildSearchOptions(DEFAULT_SEARCH_FLAGS, DECO, false);
    expect(opts.decorations).toEqual({
      matchBackground: "#aabbcc80",
      matchOverviewRuler: "#445566",
      activeMatchBackground: "#112233cc",
      activeMatchColorOverviewRuler: "#445566",
    });
  });
});

describe("rgbToHex", () => {
  it("passes #RRGGBB through (lowercased)", () => {
    expect(rgbToHex("#AABBCC")).toBe("#aabbcc");
    expect(rgbToHex("  #112233 ")).toBe("#112233");
  });

  it("expands #RGB shorthand", () => {
    expect(rgbToHex("#abc")).toBe("#aabbcc");
    expect(rgbToHex("#F0A")).toBe("#ff00aa");
  });

  it("converts rgb()/rgba() (dropping alpha)", () => {
    expect(rgbToHex("rgb(170, 187, 204)")).toBe("#aabbcc");
    expect(rgbToHex("rgba(255, 0, 170, 0.5)")).toBe("#ff00aa");
    expect(rgbToHex("rgb(0 120 212)")).toBe("#0078d4");
  });

  it("clamps and rounds out-of-range / fractional channels", () => {
    expect(rgbToHex("rgb(300, -5, 127.6)")).toBe("#ff0080");
  });

  it("returns null for anything it can't normalize", () => {
    expect(rgbToHex("rebeccapurple")).toBeNull();
    expect(rgbToHex("hsl(200, 50%, 50%)")).toBeNull();
    expect(rgbToHex("#12")).toBeNull();
    expect(rgbToHex("")).toBeNull();
  });
});

describe("blendOver", () => {
  it("composites a translucent fg over an opaque bg", () => {
    // 0x80 alpha ≈ 50%: halfway between fg and bg per channel.
    expect(blendOver("#ffffff80", "#000000")).toBe("#808080");
    expect(blendOver("#ff000080", "#0000ff")).toBe("#80007f");
  });

  it("returns the fg unchanged when it's already opaque", () => {
    expect(blendOver("#abcdef", "#123456")).toBe("#abcdef");
    expect(blendOver("#fff", "#000000")).toBe("#ffffff");
  });

  it("matches Monaco's translucent orange over the dark terminal surface", () => {
    // #ea5c0055 (alpha 0x55 ≈ 33%) over #0f1115 → a muted brown-orange.
    expect(blendOver("#ea5c0055", "#0f1115")).toBe("#582a0e");
  });

  it("falls back to fg when an input can't be parsed", () => {
    expect(blendOver("rgb(1,2,3)", "#000000")).toBe("rgb(1,2,3)");
    expect(blendOver("#ea5c0055", "transparent")).toBe("#ea5c0055");
  });
});

describe("isLightColor", () => {
  it("is true for light surfaces, false for dark", () => {
    expect(isLightColor("#ffffff")).toBe(true);
    expect(isLightColor("#e5e5e5")).toBe(true);
    expect(isLightColor("#000000")).toBe(false);
    expect(isLightColor("#0f1115")).toBe(false);
  });

  it("returns false for unparseable input", () => {
    expect(isLightColor("rgb(255,255,255)")).toBe(false);
    expect(isLightColor("")).toBe(false);
  });
});

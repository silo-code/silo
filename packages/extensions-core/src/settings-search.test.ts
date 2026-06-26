import { describe, it, expect } from "vitest";
import { rowMatches, filterSections } from "./settings-search";

describe("rowMatches", () => {
  it("matches on label (case-insensitive)", () => {
    expect(rowMatches({ label: "Font size" }, "font")).toBe(true);
    expect(rowMatches({ label: "Font size" }, "FONT")).toBe(true);
    expect(rowMatches({ label: "Font size" }, "SIZE")).toBe(true);
  });

  it("matches on hint (case-insensitive)", () => {
    expect(
      rowMatches(
        { label: "Breadcrumbs", hint: "Show the working directory" },
        "working",
      ),
    ).toBe(true);
    expect(
      rowMatches(
        { label: "Breadcrumbs", hint: "Show the working directory" },
        "WORKING",
      ),
    ).toBe(true);
  });

  it("returns false when neither label nor hint matches", () => {
    expect(
      rowMatches({ label: "Font size", hint: "Offset in px" }, "shell"),
    ).toBe(false);
  });

  it("returns false with no hint and no label match", () => {
    expect(rowMatches({ label: "Font size" }, "cursor")).toBe(false);
  });

  it("treats missing hint as no-match (not an error)", () => {
    expect(rowMatches({ label: "Font size" }, "px")).toBe(false);
  });
});

const sections = [
  {
    title: "Display",
    rows: [
      { label: "Breadcrumbs", hint: "Show the working-directory bar" },
      { label: "Cursor style" },
    ],
  },
  {
    title: "Font",
    rows: [
      { label: "Font family", hint: "Monospace font for the terminal" },
      { label: "Font size", hint: "Offset from the UI font size in px" },
    ],
  },
  {
    title: "Shell",
    rows: [
      { label: "Shell path", hint: "Program to launch" },
      { label: "Shell arguments", hint: "Whitespace-separated args" },
    ],
  },
];

describe("filterSections", () => {
  it("returns original array when query is empty", () => {
    expect(filterSections(sections, "")).toBe(sections);
  });

  it("filters rows by label match within a section", () => {
    const result = filterSections(sections, "cursor");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Display");
    expect(result[0].rows).toHaveLength(1);
    expect(result[0].rows[0].label).toBe("Cursor style");
  });

  it("filters rows by hint match", () => {
    const result = filterSections(sections, "monospace");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Font");
    expect(result[0].rows[0].label).toBe("Font family");
  });

  it("keeps all rows when section title matches", () => {
    const result = filterSections(sections, "font");
    const fontSection = result.find((s) => s.title === "Font");
    expect(fontSection?.rows).toHaveLength(2);
  });

  it("drops sections with no matching rows", () => {
    const result = filterSections(sections, "shell");
    expect(result.every((s) => s.title === "Shell")).toBe(true);
    expect(result).toHaveLength(1);
  });

  it("returns empty array when nothing matches", () => {
    expect(filterSections(sections, "zzznomatch")).toHaveLength(0);
  });

  it("is case-insensitive", () => {
    expect(filterSections(sections, "FONT")).toHaveLength(
      filterSections(sections, "font").length,
    );
  });

  it("matches across multiple sections", () => {
    const result = filterSections(sections, "working");
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe("Display");
  });
});

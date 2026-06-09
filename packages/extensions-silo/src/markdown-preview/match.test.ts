import { describe, it, expect } from "vitest";
import { matchMarkdown } from "./match";

describe("matchMarkdown", () => {
  it("matches markdown extensions case-insensitively", () => {
    expect(matchMarkdown("/a/readme.md")).toBe(true);
    expect(matchMarkdown("/a/NOTES.MD")).toBe(true);
    expect(matchMarkdown("/a/doc.markdown")).toBe(true);
    expect(matchMarkdown("/a/x.mdown")).toBe(true);
    expect(matchMarkdown("/a/x.mkd")).toBe(true);
  });

  it("rejects non-markdown files and null (untitled)", () => {
    expect(matchMarkdown("/a/main.ts")).toBe(false);
    expect(matchMarkdown("/a/readme")).toBe(false);
    expect(matchMarkdown("/a/readme.md.bak")).toBe(false);
    expect(matchMarkdown(null)).toBe(false);
  });
});

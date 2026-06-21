import { describe, it, expect } from "vitest";
import { parseFrontmatter, formatFrontmatterValue } from "./frontmatter";

describe("parseFrontmatter", () => {
  it("returns null for content without frontmatter", () => {
    expect(parseFrontmatter("# Hello\n\nworld")).toBeNull();
  });

  it("returns null for content that starts with --- but has no closing ---", () => {
    expect(parseFrontmatter("---\ntitle: Foo\n")).toBeNull();
  });

  it("parses a simple frontmatter block and strips it from the body", () => {
    const content = "---\ntitle: My Doc\ndate: 2026-06-21\n---\n\n# Body";
    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result!.fields).toEqual({ title: "My Doc", date: "2026-06-21" });
    expect(result!.body).toBe("\n# Body");
  });

  it("handles CRLF line endings", () => {
    const content = "---\r\ntitle: CRLF\r\n---\r\n\r\n# Body";
    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result!.fields.title).toBe("CRLF");
  });

  it("returns null when YAML parses to a non-object (scalar)", () => {
    expect(parseFrontmatter("---\njust a string\n---\n")).toBeNull();
  });

  it("returns null when YAML parses to an array", () => {
    expect(parseFrontmatter("---\n- a\n- b\n---\n")).toBeNull();
  });

  it("returns null for invalid YAML", () => {
    expect(parseFrontmatter("---\n: bad: yaml: :\n---\n")).toBeNull();
  });

  it("handles array values in frontmatter", () => {
    const content = "---\ntags:\n  - foo\n  - bar\n---\nbody";
    const result = parseFrontmatter(content);
    expect(result).not.toBeNull();
    expect(result!.fields.tags).toEqual(["foo", "bar"]);
    expect(result!.body).toBe("body");
  });

  it("returns empty body when nothing follows the frontmatter", () => {
    const result = parseFrontmatter("---\ntitle: Only\n---\n");
    expect(result).not.toBeNull();
    expect(result!.body).toBe("");
  });

  it("does not match --- in the middle of content", () => {
    const content = "# Heading\n\n---\ntitle: nope\n---\n";
    expect(parseFrontmatter(content)).toBeNull();
  });
});

describe("formatFrontmatterValue", () => {
  it("converts a string as-is", () => {
    expect(formatFrontmatterValue("hello")).toBe("hello");
  });

  it("converts a number", () => {
    expect(formatFrontmatterValue(42)).toBe("42");
  });

  it("joins arrays with comma-space", () => {
    expect(formatFrontmatterValue(["a", "b", "c"])).toBe("a, b, c");
  });

  it("stringifies objects as compact JSON", () => {
    expect(formatFrontmatterValue({ x: 1 })).toBe('{"x":1}');
  });

  it("handles null", () => {
    expect(formatFrontmatterValue(null)).toBe("");
  });

  it("handles undefined", () => {
    expect(formatFrontmatterValue(undefined)).toBe("");
  });

  it("handles boolean values", () => {
    expect(formatFrontmatterValue(true)).toBe("true");
    expect(formatFrontmatterValue(false)).toBe("false");
  });
});

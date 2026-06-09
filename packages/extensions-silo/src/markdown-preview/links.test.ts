import { describe, it, expect } from "vitest";
import { classifyMarkdownLink, resolveFilePath } from "./links";

const FILE = "/Users/me/notes/readme.md";

describe("classifyMarkdownLink", () => {
  it("routes http(s) and mailto links externally", () => {
    expect(classifyMarkdownLink("https://silo.dev", FILE)).toEqual({
      kind: "external",
      url: "https://silo.dev",
    });
    expect(classifyMarkdownLink("HTTP://EXAMPLE.com", FILE)).toEqual({
      kind: "external",
      url: "HTTP://EXAMPLE.com",
    });
    expect(classifyMarkdownLink("mailto:a@b.com", FILE)).toEqual({
      kind: "external",
      url: "mailto:a@b.com",
    });
  });

  it("treats `#fragment` as an anchor and decodes it", () => {
    expect(classifyMarkdownLink("#section", FILE)).toEqual({
      kind: "anchor",
      id: "section",
    });
    expect(classifyMarkdownLink("#a%20b", FILE)).toEqual({
      kind: "anchor",
      id: "a b",
    });
  });

  it("ignores other explicit schemes and protocol-relative URLs", () => {
    for (const href of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "tel:+15551234",
      "vscode://foo",
      "//cdn.example.com/x.js",
      "",
      "   ",
    ]) {
      expect(classifyMarkdownLink(href, FILE)).toEqual({ kind: "ignore" });
    }
  });

  it("resolves relative paths against the previewed file's directory", () => {
    expect(classifyMarkdownLink("./guide.md", FILE)).toEqual({
      kind: "file",
      path: "/Users/me/notes/guide.md",
    });
    expect(classifyMarkdownLink("../other/x.md", FILE)).toEqual({
      kind: "file",
      path: "/Users/me/other/x.md",
    });
    expect(classifyMarkdownLink("sibling.md", FILE)).toEqual({
      kind: "file",
      path: "/Users/me/notes/sibling.md",
    });
  });

  it("resolves absolute paths from root", () => {
    expect(classifyMarkdownLink("/etc/hosts.md", FILE)).toEqual({
      kind: "file",
      path: "/etc/hosts.md",
    });
  });

  it("strips query/fragment and decodes escapes from file paths", () => {
    expect(classifyMarkdownLink("./my%20doc.md#top", FILE)).toEqual({
      kind: "file",
      path: "/Users/me/notes/my doc.md",
    });
    expect(classifyMarkdownLink("./x.md?v=1", FILE)).toEqual({
      kind: "file",
      path: "/Users/me/notes/x.md",
    });
  });

  it("ignores relative links when there is no previewed file (untitled)", () => {
    expect(classifyMarkdownLink("./x.md", null)).toEqual({ kind: "ignore" });
    // but absolute external links still work without a file path
    expect(classifyMarkdownLink("https://x.dev", null)).toEqual({
      kind: "external",
      url: "https://x.dev",
    });
  });
});

describe("resolveFilePath", () => {
  it("collapses `.` and `..` segments", () => {
    expect(resolveFilePath("./a/./b/../c.md", FILE)).toBe(
      "/Users/me/notes/a/c.md",
    );
  });

  it("clamps `..` past the root rather than escaping it", () => {
    expect(resolveFilePath("../../../../../x.md", FILE)).toBe("/x.md");
  });

  it("returns null without a base file", () => {
    expect(resolveFilePath("x.md", null)).toBeNull();
  });
});

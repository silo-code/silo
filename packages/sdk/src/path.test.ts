import { describe, it, expect } from "vitest";
import { path } from "./path";

describe("path.normalize", () => {
  it("collapses dot segments", () =>
    expect(path.normalize("a/./b")).toBe("a/b"));
  it("resolves dot-dot segments", () =>
    expect(path.normalize("a/b/../c")).toBe("a/c"));
  it("converts backslash to forward-slash", () =>
    expect(path.normalize("a\\b")).toBe("a/b"));
  it("collapses duplicate slashes", () =>
    expect(path.normalize("a//b")).toBe("a/b"));
  it("preserves POSIX absolute", () =>
    expect(path.normalize("/a/b")).toBe("/a/b"));
  it("handles Windows drive", () =>
    expect(path.normalize("C:\\a\\b")).toBe("C:/a/b"));
  it("handles Windows drive with forward-slash", () =>
    expect(path.normalize("C:/a/b")).toBe("C:/a/b"));
  it("stays at root when dot-dot exceeds root", () =>
    expect(path.normalize("/a/../..")).toBe("/"));
  it("returns dot for empty-ish relative path", () =>
    expect(path.normalize("a/..")).toBe("."));
  it("UNC path is preserved", () =>
    expect(path.normalize("\\\\server\\share\\foo")).toBe(
      "//server/share/foo",
    ));
});

describe("path.join", () => {
  it("joins two segments", () => expect(path.join("a", "b")).toBe("a/b"));
  it("joins many segments", () =>
    expect(path.join("a", "b", "c")).toBe("a/b/c"));
  it("resolves dot-dot across join", () =>
    expect(path.join("a/b", "../c")).toBe("a/c"));
  it("preserves leading slash from first segment", () =>
    expect(path.join("/a", "b")).toBe("/a/b"));
  it("converts backslash", () => expect(path.join("a\\b", "c")).toBe("a/b/c"));
  it("returns dot for no arguments", () => expect(path.join()).toBe("."));
  it("ignores empty string segments", () =>
    expect(path.join("a", "", "b")).toBe("a/b"));
  it("handles Windows drive", () =>
    expect(path.join("C:\\a", "b")).toBe("C:/a/b"));
  it('join("/", rel) produces "/rel" not "//rel" (UNC)', () =>
    expect(path.join("/", "linked.md")).toBe("/linked.md"));
  it("join of POSIX root with nested rel stays absolute", () =>
    expect(path.join("/", "a/b/../c")).toBe("/a/c"));
});

describe("path.dirname", () => {
  it("returns parent dir", () => expect(path.dirname("/a/b/c")).toBe("/a/b"));
  it("returns slash for top-level file", () =>
    expect(path.dirname("/a")).toBe("/"));
  it("returns dot for bare filename", () =>
    expect(path.dirname("a")).toBe("."));
  it("handles Windows drive", () =>
    expect(path.dirname("C:\\a\\b")).toBe("C:/a"));
  it("returns drive root for top-level", () =>
    expect(path.dirname("C:\\a")).toBe("C:/"));
  it("resolves trailing slash before computing", () =>
    expect(path.dirname("/a/b/")).toBe("/a"));
  it("handles UNC path", () =>
    expect(path.dirname("//server/share/foo")).toBe("//server/share"));
  it("returns dot for relative bare name", () =>
    expect(path.dirname("file.ts")).toBe("."));
  it("returns relative parent", () => expect(path.dirname("a/b")).toBe("a"));
});

describe("path.basename", () => {
  it("returns last segment", () =>
    expect(path.basename("/a/b/file.ts")).toBe("file.ts"));
  it("strips provided extension", () =>
    expect(path.basename("file.ts", ".ts")).toBe("file"));
  it("does not strip if extension doesn't match", () =>
    expect(path.basename("file.ts", ".js")).toBe("file.ts"));
  it("handles trailing slash", () => expect(path.basename("/a/b/")).toBe("b"));
  it("handles Windows path", () =>
    expect(path.basename("C:\\a\\b.txt")).toBe("b.txt"));
  it("returns empty string for root", () =>
    expect(path.basename("/")).toBe(""));
  it("returns bare name", () =>
    expect(path.basename("file.ts")).toBe("file.ts"));
});

describe("path.extname", () => {
  it("returns extension with dot", () =>
    expect(path.extname("file.ts")).toBe(".ts"));
  it("returns last extension only", () =>
    expect(path.extname("file.test.ts")).toBe(".ts"));
  it("returns empty for no extension", () =>
    expect(path.extname("file")).toBe(""));
  it("returns empty for dotfile (dot at position 0)", () =>
    expect(path.extname(".gitignore")).toBe(""));
  it("returns dot for trailing dot", () =>
    expect(path.extname("file.")).toBe("."));
  it("handles full path", () =>
    expect(path.extname("/a/b/file.md")).toBe(".md"));
});

describe("path.isAbsolute", () => {
  it("true for POSIX absolute", () =>
    expect(path.isAbsolute("/foo")).toBe(true));
  it("true for Windows drive with backslash", () =>
    expect(path.isAbsolute("C:\\foo")).toBe(true));
  it("true for Windows drive with forward-slash", () =>
    expect(path.isAbsolute("C:/foo")).toBe(true));
  it("true for UNC backslash", () =>
    expect(path.isAbsolute("\\\\server\\share")).toBe(true));
  it("true for UNC forward-slash", () =>
    expect(path.isAbsolute("//server/share")).toBe(true));
  it("false for relative path", () =>
    expect(path.isAbsolute("foo/bar")).toBe(false));
  it("false for drive-relative (no slash)", () =>
    expect(path.isAbsolute("C:foo")).toBe(false));
  it("false for bare filename", () =>
    expect(path.isAbsolute("file.ts")).toBe(false));
});

describe("path.relative", () => {
  it("computes sibling relative path", () =>
    expect(path.relative("/a/b", "/a/c")).toBe("../c"));
  it("returns dot for same path", () =>
    expect(path.relative("/a/b", "/a/b")).toBe("."));
  it("returns descendant path", () =>
    expect(path.relative("/a", "/a/b/c")).toBe("b/c"));
  it("returns parent path", () =>
    expect(path.relative("/a/b/c", "/a")).toBe("../.."));
  it("handles root to subpath", () =>
    expect(path.relative("/", "/a/b")).toBe("a/b"));
  it("returns normalized `to` for different Windows drives", () =>
    expect(path.relative("C:/a", "D:/b")).toBe("D:/b"));
  it("same drive computes relative", () =>
    expect(path.relative("C:/a/b", "C:/a/c")).toBe("../c"));
  it("handles backslash inputs", () =>
    expect(path.relative("C:\\a\\b", "C:\\a\\c")).toBe("../c"));
});

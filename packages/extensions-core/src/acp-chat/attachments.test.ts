import { describe, it, expect } from "vitest";
import { basename, fileUri, toAttachment } from "./attachments";

describe("basename", () => {
  it("takes the last segment of a posix or windows path", () => {
    expect(basename("/Users/d/notes/todo.md")).toBe("todo.md");
    expect(basename("C:\\work\\main.rs")).toBe("main.rs");
  });
  it("ignores a trailing slash", () => {
    expect(basename("/Users/d/src/")).toBe("src");
  });
});

describe("fileUri", () => {
  it("builds a file:// URI, percent-encoding each segment", () => {
    expect(fileUri("/Users/d/my notes/a#b.md")).toBe(
      "file:///Users/d/my%20notes/a%23b.md",
    );
  });
  it("adds a leading slash for a bare path", () => {
    expect(fileUri("tmp/x.txt")).toBe("file:///tmp/x.txt");
  });
});

describe("toAttachment", () => {
  it("pairs the uri with the display name", () => {
    expect(toAttachment("/Users/d/notes/todo.md")).toEqual({
      uri: "file:///Users/d/notes/todo.md",
      name: "todo.md",
    });
  });
});

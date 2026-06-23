import { describe, expect, it } from "vitest";
import { buildTerminalPaste } from "./terminal-path-paste";

describe("buildTerminalPaste", () => {
  it("wraps a simple path in single quotes", () => {
    expect(buildTerminalPaste(["/path/to/file.txt"])).toBe(
      "'/path/to/file.txt'",
    );
  });

  it("escapes embedded single quotes with POSIX sequence", () => {
    expect(buildTerminalPaste(["/path/it's here/file"])).toBe(
      "'/path/it'\\''s here/file'",
    );
  });

  it("joins multiple paths with a space", () => {
    expect(buildTerminalPaste(["/a/b", "/c/d"])).toBe("'/a/b' '/c/d'");
  });

  it("handles multiple paths that each contain single quotes", () => {
    expect(buildTerminalPaste(["/a's/b", "/c/d's"])).toBe(
      "'/a'\\''s/b' '/c/d'\\''s'",
    );
  });

  it("returns an empty string for an empty array", () => {
    expect(buildTerminalPaste([])).toBe("");
  });
});

import { describe, expect, it } from "vitest";
import { matchFilePaths } from "./terminal-link-match";

function texts(line: string): string[] {
  return matchFilePaths(line).map((m) => m.text);
}

describe("matchFilePaths", () => {
  it("matches absolute, home, and dotted-prefix paths", () => {
    expect(texts("/abs/path/file.ts")).toEqual(["/abs/path/file.ts"]);
    expect(texts("~/Documents/a.ts")).toEqual(["~/Documents/a.ts"]);
    expect(texts("./rel/file.ts")).toEqual(["./rel/file.ts"]);
    expect(texts("../rel/file.ts")).toEqual(["../rel/file.ts"]);
  });

  it("matches bare relative paths that end in an extension", () => {
    expect(texts("src/foo.ts")).toEqual(["src/foo.ts"]);
    expect(texts("foo/.playwright-mcp/page.png")).toEqual([
      "foo/.playwright-mcp/page.png",
    ]);
  });

  it("matches paths that start with a hidden directory", () => {
    expect(texts(".playwright-mcp/page-2026-07-22T14-54-40-712Z.png")).toEqual([
      ".playwright-mcp/page-2026-07-22T14-54-40-712Z.png",
    ]);
    expect(texts("see [.env/local.json] next")).toEqual([".env/local.json"]);
  });

  it("strips surrounding brackets and trailing sentence punctuation", () => {
    expect(
      texts("shot: [.playwright-mcp/page-2026-07-22T14-54-40-712Z.png] - done"),
    ).toEqual([".playwright-mcp/page-2026-07-22T14-54-40-712Z.png"]);
    expect(texts("see /etc/hosts.")).toEqual(["/etc/hosts"]);
  });

  it("does not start a match mid-token after a hyphen", () => {
    expect(texts(".playwright-mcp/page.png")).toEqual([
      ".playwright-mcp/page.png",
    ]);
    expect(texts("foo-bar/baz.ts")).toEqual(["foo-bar/baz.ts"]);
  });

  it("skips extension-less paths and non-path noise", () => {
    expect(texts(".git/config")).toEqual([]);
    expect(texts("1/2")).toEqual([]);
  });

  it("matches paths with spaces when wrapped in a delimiter pair", () => {
    expect(
      texts(
        "Write(~/.xerro/documents/Blog Posts/Workspaces Paradigm Shift.md)",
      ),
    ).toEqual(["~/.xerro/documents/Blog Posts/Workspaces Paradigm Shift.md"]);
    expect(texts("[~/My Documents/notes.txt]")).toEqual([
      "~/My Documents/notes.txt",
    ]);
    expect(texts('"/abs/path/with space/file.ts"')).toEqual([
      "/abs/path/with space/file.ts",
    ]);
    expect(texts("'/abs/path/with space/file.ts'")).toEqual([
      "/abs/path/with space/file.ts",
    ]);
  });

  it("does not let a space-containing path run past its delimiter", () => {
    expect(
      texts("Write(~/Blog Posts/Shift.md) and also (some other note)"),
    ).toEqual(["~/Blog Posts/Shift.md"]);
  });

  it("does not allow spaces in undelimited paths", () => {
    // The space still breaks the match into two spans (pre-existing
    // behavior for space-free path detection); it just no longer swallows
    // trailing prose the way an unbounded space-inclusive class would.
    expect(
      texts("Wrote 97 lines to ~/Blog Posts/Shift.md successfully"),
    ).toEqual(["~/Blog", "Posts/Shift.md"]);
  });
});

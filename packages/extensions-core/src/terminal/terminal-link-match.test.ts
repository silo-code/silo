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

  it("matches Windows drive-absolute paths whole", () => {
    expect(
      texts(String.raw`C:\Users\dweaver\AppData\Local\Silo\silo.exe`),
    ).toEqual([String.raw`C:\Users\dweaver\AppData\Local\Silo\silo.exe`]);
    expect(texts(String.raw`see D:\logs\terminal.log for the trail`)).toEqual([
      String.raw`D:\logs\terminal.log`,
    ]);
    // Windows accepts forward slashes just as well.
    expect(texts("C:/Users/dweaver/silo.exe")).toEqual([
      "C:/Users/dweaver/silo.exe",
    ]);
    // A directory with no extension links, same as the POSIX `/etc/hosts` case.
    expect(texts(String.raw`C:\Users\dweaver`)).toEqual([
      String.raw`C:\Users\dweaver`,
    ]);
  });

  it("carries a line/col suffix on a Windows path", () => {
    expect(texts(String.raw`C:\src\main.ts:42:7`)).toEqual([
      String.raw`C:\src\main.ts:42:7`,
    ]);
  });

  it("matches a Windows path with spaces when delimited", () => {
    expect(texts(String.raw`"C:\Program Files\Silo\silo.exe"`)).toEqual([
      String.raw`C:\Program Files\Silo\silo.exe`,
    ]);
  });

  it("strips a trailing separator and sentence punctuation", () => {
    expect(texts(String.raw`installed into C:\Users\dweaver\.`)).toEqual([
      String.raw`C:\Users\dweaver`,
    ]);
  });

  it("does not link a fragment after a backslash when the path has no drive", () => {
    // `$env:LOCALAPPDATA\silo-session-host-test.exe` has no resolvable root;
    // linking the trailing filename alone would open the wrong thing.
    expect(
      texts(String.raw`Copy-Item $env:LOCALAPPDATA\silo-host.exe $dest`),
    ).toEqual([]);
    expect(texts(String.raw`relative\dir\file.ts`)).toEqual([]);
  });

  it("does not link a bare drive root with nothing after the separator", () => {
    // A drive letter alone has no path to open. Without a required char
    // after the separator this used to match `C:\` and then, since a
    // trailing backslash strips as punctuation, silently truncate to `C`.
    expect(texts(String.raw`installed to C:\ already`)).toEqual([]);
    expect(texts("installed to C:/ already")).toEqual([]);
  });

  it("leaves backslash escapes alone", () => {
    expect(texts(String.raw`split on \n and match \d+ here`)).toEqual([]);
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

  it("absorbs an interior space in an undelimited path", () => {
    // The space is only taken because `Blog Posts` is followed by a
    // separator — proof it was interior to the path, not the end of it. The
    // trailing prose stays out.
    expect(
      texts("Wrote 97 lines to ~/Blog Posts/Shift.md successfully"),
    ).toEqual(["~/Blog Posts/Shift.md"]);
    expect(
      texts("Edit /Users/dave/documents/Global Navigation/Overview.md"),
    ).toEqual(["/Users/dave/documents/Global Navigation/Overview.md"]);
    expect(texts(String.raw`run C:\Program Files\Silo\silo.exe now`)).toEqual([
      String.raw`C:\Program Files\Silo\silo.exe`,
    ]);
  });

  it("takes one interior space per segment, not a run of them", () => {
    expect(texts("wrote /a/b.md then src/foo.ts")).toEqual([
      "/a/b.md",
      "src/foo.ts",
    ]);
  });

  it("links a path whose spaces are backslash-escaped", () => {
    const spans = matchFilePaths(
      String.raw`wrote ~/Blog\ Posts/My\ Post.md ok`,
    );
    expect(spans.map((s) => s.text)).toEqual([
      String.raw`~/Blog\ Posts/My\ Post.md`,
    ]);
    // What the editor is handed has the escapes collapsed.
    expect(spans[0]?.href).toBe("~/Blog Posts/My Post.md");
  });

  it("stops an undelimited path at a space in its last segment", () => {
    // Nothing terminates the final segment, so absorbing a space there would
    // let the match run into the sentence after it.
    // (The terminal has no bare-filename rule, so the tail links nothing.)
    expect(texts("~/My Notes/Trip Notes.txt")).toEqual(["~/My Notes/Trip"]);
  });

  it("does not absorb the space before an unrelated path", () => {
    expect(texts("see /etc/hosts and /etc/passwd now")).toEqual([
      "/etc/hosts",
      "/etc/passwd",
    ]);
    expect(texts("open /src/foo and then stop")).toEqual(["/src/foo"]);
  });
});

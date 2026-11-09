import { describe, expect, it } from "vitest";
import { filePathFromUrl, kindFromHref, matchChatLinks } from "./link-match";

function texts(line: string, knownPaths?: readonly string[]): string[] {
  return matchChatLinks(line, knownPaths).map((m) => m.text);
}

function kinds(line: string): string[] {
  return matchChatLinks(line).map((m) => `${m.kind}:${m.text}`);
}

describe("matchChatLinks", () => {
  it("matches http(s) URLs and strips trailing sentence punctuation", () => {
    expect(texts("see https://getsilo.dev/docs.")).toEqual([
      "https://getsilo.dev/docs",
    ]);
    expect(texts("open https://example.com/a and go")).toEqual([
      "https://example.com/a",
    ]);
  });

  it("matches file:// URLs as urls, not paths", () => {
    expect(kinds("file:///Users/dev/a.ts")).toEqual([
      "url:file:///Users/dev/a.ts",
    ]);
  });

  it("does not also mark a path span inside a URL", () => {
    expect(kinds("https://example.com/src/foo.ts")).toEqual([
      "url:https://example.com/src/foo.ts",
    ]);
  });

  it("matches the same path shapes the terminal does", () => {
    expect(texts("/abs/path/file.ts")).toEqual(["/abs/path/file.ts"]);
    expect(texts("~/Documents/a.ts")).toEqual(["~/Documents/a.ts"]);
    expect(texts("src/foo.ts")).toEqual(["src/foo.ts"]);
    expect(texts("see /etc/hosts.")).toEqual(["/etc/hosts"]);
  });

  it("matches Windows drive-absolute paths whole", () => {
    expect(
      texts(String.raw`$src = "C:\Users\dweaver\AppData\Local\Silo\silo.exe"`),
    ).toEqual([String.raw`C:\Users\dweaver\AppData\Local\Silo\silo.exe`]);
    expect(texts(String.raw`see D:\logs\terminal.log for the trail`)).toEqual([
      String.raw`D:\logs\terminal.log`,
    ]);
    expect(texts(String.raw`"C:\Program Files\Silo\silo.exe"`)).toEqual([
      String.raw`C:\Program Files\Silo\silo.exe`,
    ]);
  });

  it("links nothing in an env-rooted Windows path", () => {
    // The reported bug: with no drive to root it, the matcher used to fall
    // through to the bare-filename rule and underline `silo-host.exe` alone
    // — a fragment ⌘-click would resolve to the wrong file.
    expect(
      texts(String.raw`Remove-Item "$env:LOCALAPPDATA\silo-host.exe"`),
    ).toEqual([]);
    expect(texts(String.raw`$env:APPDATA\com.silo.desktop\test.port`)).toEqual(
      [],
    );
  });

  it("does not link a bare relative path with no drive letter", () => {
    expect(texts(String.raw`relative\dir\file.ts`)).toEqual([]);
  });

  it("does not link a bare drive root with nothing after the separator", () => {
    // Without a required char after the separator this used to match `C:\`
    // and then, since a trailing backslash strips as punctuation, silently
    // truncate to `C`.
    expect(texts(String.raw`installed to C:\ already`)).toEqual([]);
    expect(texts("installed to C:/ already")).toEqual([]);
  });

  it("leaves backslash escapes alone", () => {
    expect(texts(String.raw`split on \n and match \d+ here`)).toEqual([]);
  });

  it("skips extension-less noise", () => {
    expect(texts("1/2")).toEqual([]);
  });

  it("matches a bare filename (no directory) with a 3-char extension", () => {
    expect(texts("Edit tool-demo.txt")).toEqual(["tool-demo.txt"]);
    expect(texts("see log.out for details")).toEqual(["log.out"]);
  });

  it("absorbs an interior space in an undelimited path", () => {
    // The reported bug: a tool title naming a real folder with a space in it
    // used to break into two links — `/…/ServiceTitan/Global` and a bogus
    // `Navigation/Overview.md` that resolved to nothing. The space is only
    // absorbed because `Global Navigation` is followed by a separator.
    expect(
      texts(
        "Edit /Users/dave/documents/ServiceTitan/Global Navigation/Overview.md",
      ),
    ).toEqual([
      "/Users/dave/documents/ServiceTitan/Global Navigation/Overview.md",
    ]);
    expect(
      texts("Wrote 97 lines to ~/Blog Posts/Shift.md successfully"),
    ).toEqual(["~/Blog Posts/Shift.md"]);
    expect(texts(String.raw`run C:\Program Files\Silo\silo.exe now`)).toEqual([
      String.raw`C:\Program Files\Silo\silo.exe`,
    ]);
  });

  it("takes one interior space per segment, not a run of them", () => {
    // A greedy walk would cross the sentence to reach `src/`, linking
    // `/a/b.md then src/foo.ts` as one path. Anything longer than one space is
    // for hover verification to confirm (RFC 0066).
    expect(texts("wrote /a/b.md then src/foo.ts")).toEqual([
      "/a/b.md",
      "src/foo.ts",
    ]);
    // A three-word directory stays unread here — hover verification is what
    // reaches it, and swallows the stray second span while it does.
    expect(texts("/a/My Big Notes/x.txt")).toEqual(["/a/My", "Notes/x.txt"]);
  });

  it("stops an undelimited path at a space in its last segment", () => {
    // Nothing terminates the final segment, so absorbing a space there would
    // let the match run into the sentence after it. (`Notes.txt` links on its
    // own under the bare-filename rule.)
    expect(texts("~/My Notes/Trip Notes.txt")).toEqual([
      "~/My Notes/Trip",
      "Notes.txt",
    ]);
  });

  it("does not absorb the space before an unrelated path", () => {
    expect(texts("see /etc/hosts and /etc/passwd now")).toEqual([
      "/etc/hosts",
      "/etc/passwd",
    ]);
    expect(texts("open /src/foo and then stop")).toEqual(["/src/foo"]);
  });

  it("skips a bare filename whose extension isn't 3 chars", () => {
    expect(texts("using Node.js")).toEqual([]);
    expect(texts("edited notes.md")).toEqual([]);
    expect(texts("wrote config.json")).toEqual([]);
  });
});

describe("matchChatLinks with known paths", () => {
  it("links a known path whole, spaces and all", () => {
    const known = "/Users/me/docs/Global Navigation/Overview.md";
    expect(texts(`Edit ${known}`, [known])).toEqual([known]);
  });

  it("outranks a heuristic reading of the same characters", () => {
    // Without the location, `…/Global` and `Navigation/Overview.md` would be
    // two spans, the second of them bogus.
    const known = "/Users/me/x/Global Nav/Overview.md";
    const line = `Edit ${known} now`;
    expect(matchChatLinks(line, [known])).toHaveLength(1);
  });

  it("keeps unrelated spans beside a known path", () => {
    const known = "/a/My Notes/b.md";
    expect(texts(`Edit ${known} then src/foo.ts`, [known])).toEqual([
      known,
      "src/foo.ts",
    ]);
  });

  it("ignores a known path the text doesn't contain", () => {
    expect(texts("Edit src/foo.ts", ["/elsewhere/other.md"])).toEqual([
      "src/foo.ts",
    ]);
  });

  it("prefers the longest known path when one nests inside another", () => {
    const dir = "/a/My Notes";
    const file = "/a/My Notes/b.md";
    expect(texts(`Edit ${file}`, [dir, file])).toEqual([file]);
  });
});

describe("escaped spaces and file URLs", () => {
  it("links a path whose spaces are backslash-escaped, and opens it unescaped", () => {
    const spans = matchChatLinks(
      String.raw`wrote ~/Blog\ Posts/My\ Post.md ok`,
    );
    expect(spans.map((s) => s.text)).toEqual([
      String.raw`~/Blog\ Posts/My\ Post.md`,
    ]);
    expect(spans[0]?.href).toBe("~/Blog Posts/My Post.md");
  });

  it("decodes a file:// URL to the path it names", () => {
    expect(filePathFromUrl("file:///Users/me/Global%20Nav/a.md")).toBe(
      "/Users/me/Global Nav/a.md",
    );
    expect(filePathFromUrl("https://example.com/a")).toBeUndefined();
  });
});

describe("kindFromHref", () => {
  it("treats http(s) and file: as urls, everything else as a path", () => {
    expect(kindFromHref("https://getsilo.dev")).toBe("url");
    expect(kindFromHref("file:///tmp/a.ts")).toBe("url");
    expect(kindFromHref("src/foo.ts")).toBe("path");
    expect(kindFromHref("/abs/a.ts")).toBe("path");
  });
});

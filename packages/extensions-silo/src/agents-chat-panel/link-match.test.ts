import { describe, expect, it } from "vitest";
import { kindFromHref, matchChatLinks } from "./link-match";

function texts(line: string): string[] {
  return matchChatLinks(line).map((m) => m.text);
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

  it("skips extension-less noise", () => {
    expect(texts("1/2")).toEqual([]);
  });

  it("matches a bare filename (no directory) with a 3-char extension", () => {
    expect(texts("Edit tool-demo.txt")).toEqual(["tool-demo.txt"]);
    expect(texts("see log.out for details")).toEqual(["log.out"]);
  });

  it("skips a bare filename whose extension isn't 3 chars", () => {
    expect(texts("using Node.js")).toEqual([]);
    expect(texts("edited notes.md")).toEqual([]);
    expect(texts("wrote config.json")).toEqual([]);
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

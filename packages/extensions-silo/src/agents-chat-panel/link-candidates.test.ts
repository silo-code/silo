import { describe, expect, it } from "vitest";
import { MAX_LADDER_WORDS, pathCandidates } from "./link-candidates";

function ladder(line: string, text: string): string[] {
  return pathCandidates(line, { text, index: line.indexOf(text) });
}

describe("pathCandidates", () => {
  it("reads longest first and ends with the span itself", () => {
    expect(
      ladder(
        "Edit /Users/me/docs/Global Navigation/Overview.md",
        "/Users/me/docs/Global",
      ),
    ).toEqual([
      "/Users/me/docs/Global Navigation/Overview.md",
      "/Users/me/docs/Global",
    ]);
  });

  it("returns the span alone when nothing follows it across a space", () => {
    // The signal callers use to skip the filesystem entirely.
    expect(ladder("see /etc/hosts", "/etc/hosts")).toEqual(["/etc/hosts"]);
    expect(ladder("/etc/hosts  two spaces", "/etc/hosts")).toEqual([
      "/etc/hosts",
    ]);
    expect(ladder("/etc/hosts ", "/etc/hosts")).toEqual(["/etc/hosts"]);
  });

  it("strips sentence punctuation from a reading but keeps walking past it", () => {
    // Readings are word-by-word, so `Notes/Trip` is one step: the ladder is
    // every place a *space* could have ended the path, not every segment.
    expect(ladder("to ~/My Notes/Trip Notes.md.", "~/My")).toEqual([
      "~/My Notes/Trip Notes.md",
      "~/My Notes/Trip",
      "~/My",
    ]);
  });

  it("caps how far it reaches into trailing prose", () => {
    const tail = Array.from({ length: 20 }, (_, i) => `w${i}`).join(" ");
    const got = ladder(`/a/b ${tail}`, "/a/b");
    expect(got).toHaveLength(MAX_LADDER_WORDS + 1);
    expect(got[0]).toBe(`/a/b ${tail.split(" ").slice(0, 10).join(" ")}`);
    expect(got[got.length - 1]).toBe("/a/b");
  });
});

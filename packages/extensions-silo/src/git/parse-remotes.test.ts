import { describe, it, expect } from "vitest";
import { parseRemotes } from "./parse-remotes";

// Fixtures mimic `git remote -v`: one tab-separated `<name>\t<url> (fetch)`
// line and one `(push)` line per remote, alphabetical by name.

describe("parseRemotes", () => {
  it("collapses a remote's fetch and push lines into one entry", () => {
    const raw = [
      "origin\tgit@github.com:silo-code/silo.git (fetch)",
      "origin\tgit@github.com:silo-code/silo.git (push)",
    ].join("\n");
    expect(parseRemotes(raw)).toEqual([
      {
        name: "origin",
        fetchUrl: "git@github.com:silo-code/silo.git",
        pushUrl: "git@github.com:silo-code/silo.git",
      },
    ]);
  });

  it("keeps a distinct pushurl separate from the fetch url", () => {
    const raw = [
      "origin\thttps://github.com/silo-code/silo.git (fetch)",
      "origin\tgit@github.com:silo-code/silo.git (push)",
    ].join("\n");
    expect(parseRemotes(raw)).toEqual([
      {
        name: "origin",
        fetchUrl: "https://github.com/silo-code/silo.git",
        pushUrl: "git@github.com:silo-code/silo.git",
      },
    ]);
  });

  it("preserves git's order across multiple remotes", () => {
    const raw = [
      "fork\tgit@github.com:me/silo.git (fetch)",
      "fork\tgit@github.com:me/silo.git (push)",
      "origin\tgit@github.com:silo-code/silo.git (fetch)",
      "origin\tgit@github.com:silo-code/silo.git (push)",
      "upstream\tgit@github.com:other/silo.git (fetch)",
      "upstream\tgit@github.com:other/silo.git (push)",
    ].join("\n");
    expect(parseRemotes(raw).map((r) => r.name)).toEqual([
      "fork",
      "origin",
      "upstream",
    ]);
  });

  it("returns an empty array for a repo with no remotes", () => {
    expect(parseRemotes("")).toEqual([]);
    expect(parseRemotes("\n")).toEqual([]);
  });

  it("keeps a url containing ' (' intact", () => {
    // A local remote can legally live under a path with parentheses; only the
    // trailing direction marker ends the url.
    const raw = [
      "local\t/Users/me/Repos (old)/silo (fetch)",
      "local\t/Users/me/Repos (old)/silo (push)",
    ].join("\n");
    expect(parseRemotes(raw)).toEqual([
      {
        name: "local",
        fetchUrl: "/Users/me/Repos (old)/silo",
        pushUrl: "/Users/me/Repos (old)/silo",
      },
    ]);
  });

  it("mirrors the present url when a direction line is missing", () => {
    const raw = "origin\tgit@github.com:silo-code/silo.git (fetch)";
    expect(parseRemotes(raw)).toEqual([
      {
        name: "origin",
        fetchUrl: "git@github.com:silo-code/silo.git",
        pushUrl: "git@github.com:silo-code/silo.git",
      },
    ]);
  });

  it("ignores lines that aren't remote entries", () => {
    const raw = [
      "not a remote line",
      "origin\tgit@github.com:silo-code/silo.git (fetch)",
      "origin\tgit@github.com:silo-code/silo.git (push)",
    ].join("\n");
    expect(parseRemotes(raw).map((r) => r.name)).toEqual(["origin"]);
  });
});

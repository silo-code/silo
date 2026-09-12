import { describe, expect, it } from "vitest";
import { resolveChatFilePath } from "./resolve-chat-path";

const worktree = "/Users/dev/proj";

describe("resolveChatFilePath", () => {
  it("resolves relative paths against the workspace folder", () => {
    expect(resolveChatFilePath("src/foo.ts", worktree)).toBe(
      "/Users/dev/proj/src/foo.ts",
    );
    expect(resolveChatFilePath("./src/foo.ts", worktree)).toBe(
      "/Users/dev/proj/src/foo.ts",
    );
  });

  it("keeps absolute paths and expands ~/", () => {
    expect(resolveChatFilePath("/etc/hosts", worktree)).toBe("/etc/hosts");
    expect(resolveChatFilePath("~/notes.txt", worktree, "/Users/dev")).toBe(
      "/Users/dev/notes.txt",
    );
  });

  it("strips a :LINE:COL suffix", () => {
    expect(resolveChatFilePath("src/foo.ts:42:7", worktree)).toBe(
      "/Users/dev/proj/src/foo.ts",
    );
  });
});

import { describe, expect, it } from "vitest";
import { resolveTerminalFilePath } from "./terminal-open-file";

describe("resolveTerminalFilePath", () => {
  const mainRepo = "/Users/dev/silo";
  const worktree = "/Users/dev/silo-wt-feat";

  it("resolves relative paths against the terminal cwd, not workspace root", () => {
    expect(resolveTerminalFilePath("src/foo.ts", worktree)).toBe(
      "/Users/dev/silo-wt-feat/src/foo.ts",
    );
    expect(resolveTerminalFilePath("./src/foo.ts", worktree)).toBe(
      "/Users/dev/silo-wt-feat/src/foo.ts",
    );
  });

  it("handles parent-directory segments relative to cwd", () => {
    expect(resolveTerminalFilePath("../shared/config.json", worktree)).toBe(
      "/Users/dev/shared/config.json",
    );
  });

  it("leaves absolute paths unchanged", () => {
    expect(resolveTerminalFilePath("/etc/hosts", worktree)).toBe("/etc/hosts");
  });

  it("leaves Windows drive-absolute paths unchanged", () => {
    expect(
      resolveTerminalFilePath(String.raw`C:\Users\dweaver\silo.exe`, worktree),
    ).toBe(String.raw`C:\Users\dweaver\silo.exe`);
    expect(resolveTerminalFilePath("C:/Users/dweaver/silo.exe", worktree)).toBe(
      "C:/Users/dweaver/silo.exe",
    );
  });

  it("strips :line:col from a Windows path", () => {
    expect(
      resolveTerminalFilePath(String.raw`C:\src\main.ts:42:7`, worktree),
    ).toBe(String.raw`C:\src\main.ts`);
  });

  it("expands home-relative paths", () => {
    expect(resolveTerminalFilePath("~/notes.txt", mainRepo, "/Users/dev")).toBe(
      "/Users/dev/notes.txt",
    );
  });

  it("strips optional :line:col suffix before resolving", () => {
    expect(resolveTerminalFilePath("src/foo.ts:42:7", worktree)).toBe(
      "/Users/dev/silo-wt-feat/src/foo.ts",
    );
  });
});

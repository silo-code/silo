import { describe, expect, it } from "vitest";
import { workspaceFolderForPath } from "./workspace-folder-for-path";

describe("workspaceFolderForPath", () => {
  const primary = "/repos/app";
  const worktree = "/repos/app-fix-x";

  it("returns the primary root for a file under it", () => {
    expect(
      workspaceFolderForPath(`${primary}/src/a.ts`, primary, [worktree]),
    ).toBe(primary);
  });

  it("returns a worktree extraFolder when the file lives there", () => {
    expect(
      workspaceFolderForPath(`${worktree}/src/settings-store.ts`, primary, [
        worktree,
      ]),
    ).toBe(worktree);
  });

  it("prefers the longest matching root when roots nest", () => {
    const nested = `${primary}/packages/pkg`;
    expect(
      workspaceFolderForPath(`${nested}/src/a.ts`, primary, [nested]),
    ).toBe(nested);
  });

  it("returns null when no root contains the path", () => {
    expect(
      workspaceFolderForPath("/elsewhere/file.ts", primary, [worktree]),
    ).toBeNull();
  });

  it("trims trailing slashes on roots", () => {
    expect(
      workspaceFolderForPath(`${worktree}/a.ts`, `${primary}/`, [
        `${worktree}/`,
      ]),
    ).toBe(worktree);
  });

  it("matches the root path itself", () => {
    expect(workspaceFolderForPath(worktree, primary, [worktree])).toBe(
      worktree,
    );
  });
});

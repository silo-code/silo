// Porcelain-parser fixture test (Phase 2 seam test). Pins parseGitStatus against
// captured real `git status --porcelain=v2 -z -b --untracked-files=all` output —
// clean, staged, untracked, modified, renamed, and ahead/behind. This is the
// proof that moving the parse out of services/tauri-git.ts (and off the bespoke
// git_status command, onto ctx.process.exec) is faithful: pure string → GitStatus,
// no app required.

import { describe, it, expect } from "vitest";
import { parseGitStatus } from "./parse-status";

describe("parseGitStatus", () => {
  it("reports a clean repo: branch, no files", () => {
    const raw = [
      "# branch.oid 393176cf9883e90ad8c21384332b312aa7c736aa",
      "# branch.head main",
      "",
    ].join("\0");
    const s = parseGitStatus(raw);
    expect(s).toEqual({
      branch: "main",
      upstream: null,
      ahead: 0,
      behind: 0,
      files: [],
      inRepo: true,
      headSha: "393176cf9883e90ad8c21384332b312aa7c736aa",
    });
  });

  it("reports headSha as null for a fresh repo with no commits yet", () => {
    const raw = ["# branch.oid (initial)", "# branch.head main", ""].join("\0");
    expect(parseGitStatus(raw).headSha).toBeNull();
  });

  it("decodes staged, modified, untracked, and renamed entries together", () => {
    // Captured from a real repo (with `-z`): a staged rename, a staged new
    // file, an unstaged modification, and an untracked file. A rename's
    // origPath is a separate NUL-terminated record right after it.
    const raw = [
      "# branch.oid 393176cf9883e90ad8c21384332b312aa7c736aa",
      "# branch.head main",
      "2 R. N... 100644 100644 100644 2fa992c 2fa992c R100 renamed.txt",
      "keep.txt",
      "1 A. N... 000000 100644 100644 0000000 19d9cc8 staged.txt",
      "1 .M N... 100644 100644 100644 7898192 7898192 tracked.txt",
      "? untracked.txt",
      "",
    ].join("\0");
    const s = parseGitStatus(raw);
    expect(s.branch).toBe("main");
    expect(s.inRepo).toBe(true);

    const byPath = Object.fromEntries(s.files.map((f) => [f.path, f]));

    expect(byPath["renamed.txt"]).toMatchObject({
      isRenamed: true,
      isStaged: true,
      isModified: false,
      origPath: "keep.txt",
      staged: "R",
      worktree: ".",
    });
    expect(byPath["staged.txt"]).toMatchObject({
      isStaged: true,
      isModified: false,
      isUntracked: false,
      isRenamed: false,
      staged: "A",
      worktree: ".",
    });
    expect(byPath["tracked.txt"]).toMatchObject({
      isStaged: false,
      isModified: true,
      isUntracked: false,
      staged: ".",
      worktree: "M",
    });
    expect(byPath["untracked.txt"]).toMatchObject({
      isUntracked: true,
      isStaged: false,
      isModified: true,
      worktree: "?",
    });
    expect(s.files).toHaveLength(4);
  });

  it("captures upstream tracking and ahead/behind counts", () => {
    const raw = [
      "# branch.head feature",
      "# branch.upstream origin/feature",
      "# branch.ab +3 -2",
      "",
    ].join("\0");
    const s = parseGitStatus(raw);
    expect(s.branch).toBe("feature");
    expect(s.upstream).toBe("origin/feature");
    expect(s.ahead).toBe(3);
    expect(s.behind).toBe(2);
  });

  it("handles a staged-and-modified file (both XY flags set)", () => {
    const raw = [
      "# branch.head main",
      "1 MM N... 100644 100644 100644 aaa bbb both.txt",
      "",
    ].join("\0");
    const f = parseGitStatus(raw).files[0];
    expect(f).toMatchObject({
      path: "both.txt",
      isStaged: true,
      isModified: true,
      staged: "M",
      worktree: "M",
    });
  });

  it("preserves spaces in file paths", () => {
    const raw = [
      "# branch.head main",
      "1 .M N... 100644 100644 100644 aaa bbb my file.txt",
      "",
    ].join("\0");
    expect(parseGitStatus(raw).files[0].path).toBe("my file.txt");
  });

  // Regression: without `-z`, git C-quotes and octal-escapes a path
  // containing a non-ASCII byte — e.g. an em dash — into
  // `"Surface 1 \342\200\224 PCS API/foo.md"`, and that literal quoted string
  // used to reach `ctx.editors.open`, producing "No such file or directory".
  // `-z` reports the raw path instead, so no unescaping is needed here.
  it("preserves a path with a non-ASCII byte", () => {
    const raw = [
      "# branch.head main",
      "1 .M N... 100644 100644 100644 aaa bbb Surface 1 — PCS API/foo.md",
      "",
    ].join("\0");
    expect(parseGitStatus(raw).files[0].path).toBe(
      "Surface 1 — PCS API/foo.md",
    );
  });

  it("keeps a renamed file's origPath as a separate NUL-terminated record", () => {
    const raw = [
      "# branch.head main",
      "2 R. N... 100644 100644 100644 aaa bbb R100 Surface 1 — PCS API/new.md",
      "Surface 1 — PCS API/old.md",
      "",
    ].join("\0");
    expect(parseGitStatus(raw).files[0]).toMatchObject({
      path: "Surface 1 — PCS API/new.md",
      origPath: "Surface 1 — PCS API/old.md",
      isRenamed: true,
    });
  });
});

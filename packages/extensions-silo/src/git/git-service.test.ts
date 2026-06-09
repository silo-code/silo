// Contract test (Phase 2 seam test): GitService against a real temporary repo,
// driven by a real-git `exec` (Node child_process) — the same shape as
// ctx.process.exec. Proves the service produces correct results end-to-end
// (status transitions, stage/unstage/commit, show, non-repo handling) without
// the running app. Runs in the unit project; only dependency is `git` on PATH.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createGitService, type ExecFn } from "./git-service";

// Real-git exec with the ctx.process.exec contract: resolves with code/stdout/
// stderr even on non-zero (never rejects on a non-zero exit).
const realExec: ExecFn = (command, args, options) =>
  new Promise((resolve) => {
    execFile(
      command,
      args,
      { cwd: options?.cwd, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const code =
          err && typeof (err as { code?: unknown }).code === "number"
            ? (err as { code: number }).code
            : err
              ? 1
              : 0;
        resolve({ stdout, stderr, code });
      },
    );
  });

const git = createGitService(realExec);

describe("GitService (against a temp repo)", () => {
  let repo: string;

  beforeEach(async () => {
    repo = mkdtempSync(join(tmpdir(), "silo-gitsvc-"));
    await realExec("git", ["init", "-q"], { cwd: repo });
    await realExec("git", ["config", "user.email", "t@t"], { cwd: repo });
    await realExec("git", ["config", "user.name", "t"], { cwd: repo });
  });

  afterEach(() => rmSync(repo, { recursive: true, force: true }));

  it("reports inRepo:false outside a repository", async () => {
    const outside = mkdtempSync(join(tmpdir(), "silo-norepo-"));
    try {
      const s = await git.status(outside);
      expect(s.inRepo).toBe(false);
      expect(s.files).toEqual([]);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it("tracks a file through untracked → staged → committed", async () => {
    writeFileSync(join(repo, "a.txt"), "hello\n");

    let s = await git.status(repo);
    expect(s.inRepo).toBe(true);
    expect(s.files.find((f) => f.path === "a.txt")).toMatchObject({
      isUntracked: true,
    });

    await git.stage(repo, ["a.txt"]);
    s = await git.status(repo);
    expect(s.files.find((f) => f.path === "a.txt")).toMatchObject({
      isStaged: true,
      isUntracked: false,
    });

    await git.commit(repo, "add a");
    s = await git.status(repo);
    expect(s.files).toEqual([]); // clean after commit
  });

  it("unstages a staged file back to modified", async () => {
    writeFileSync(join(repo, "a.txt"), "v1\n");
    await git.stage(repo, ["a.txt"]);
    await git.commit(repo, "init");
    writeFileSync(join(repo, "a.txt"), "v2\n");
    await git.stage(repo, ["a.txt"]);
    expect(
      (await git.status(repo)).files.find((f) => f.path === "a.txt"),
    ).toMatchObject({ isStaged: true });

    await git.unstage(repo, ["a.txt"]);
    expect(
      (await git.status(repo)).files.find((f) => f.path === "a.txt"),
    ).toMatchObject({ isStaged: false, isModified: true });
  });

  it("reads file content at a revision via show, empty for missing paths", async () => {
    writeFileSync(join(repo, "a.txt"), "committed\n");
    await git.stage(repo, ["a.txt"]);
    await git.commit(repo, "init");

    expect(await git.show(repo, "HEAD:a.txt")).toBe("committed\n");
    expect(await git.show(repo, "HEAD:nope.txt")).toBe(""); // missing → empty
  });

  it("reverts a working-tree change", async () => {
    writeFileSync(join(repo, "a.txt"), "orig\n");
    await git.stage(repo, ["a.txt"]);
    await git.commit(repo, "init");
    writeFileSync(join(repo, "a.txt"), "scratch\n");

    await git.revertFile(repo, ["a.txt"]);
    expect((await git.status(repo)).files).toEqual([]); // change discarded
  });
});

// Contract test (Phase 2 seam test): GitService against a real temporary repo,
// driven by a real-git `exec` (Node child_process) — the same shape as
// ctx.process.exec. Proves the service produces correct results end-to-end
// (status transitions, stage/unstage/commit, show, non-repo handling) without
// the running app. Runs in the unit project; only dependency is `git` on PATH.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFile } from "node:child_process";
import {
  mkdtempSync,
  writeFileSync,
  rmSync,
  existsSync,
  realpathSync,
} from "node:fs";
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

// Real-git tests spawn dozens of processes; under a loaded machine (the full
// suite runs files in parallel) single tests can pass vitest's 5s default.
const SUITE_TIMEOUT_MS = 20_000;

describe(
  "GitService (against a temp repo)",
  { timeout: SUITE_TIMEOUT_MS },
  () => {
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

    it("clean deletes an untracked file (discarding a new file)", async () => {
      writeFileSync(join(repo, "a.txt"), "v1\n");
      await git.stage(repo, ["a.txt"]);
      await git.commit(repo, "init");
      writeFileSync(join(repo, "junk.txt"), "scratch\n");
      expect(
        (await git.status(repo)).files.find((f) => f.path === "junk.txt"),
      ).toMatchObject({ isUntracked: true });

      await git.clean(repo, ["junk.txt"]);
      expect(existsSync(join(repo, "junk.txt"))).toBe(false);
      expect((await git.status(repo)).files).toEqual([]);
    });

    it("revertFile errors on an untracked path (use clean instead)", async () => {
      writeFileSync(join(repo, "a.txt"), "v1\n");
      await git.stage(repo, ["a.txt"]);
      await git.commit(repo, "init");
      writeFileSync(join(repo, "new.txt"), "untracked\n");
      // git restore can't act on a path it doesn't know — the panel routes
      // untracked discards to clean() for exactly this reason.
      await expect(git.revertFile(repo, ["new.txt"])).rejects.toThrow(
        /did not match any file/i,
      );
    });

    // A repo needs one commit before branches exist / can be created.
    async function seedCommit() {
      writeFileSync(join(repo, "a.txt"), "v1\n");
      await git.stage(repo, ["a.txt"]);
      await git.commit(repo, "init");
    }

    it("creates, lists, switches between, and deletes branches", async () => {
      await seedCommit();
      const initial = await git.branches(repo);
      expect(initial).toHaveLength(1);
      const base = initial[0].name; // "main" or "master" depending on git config
      expect(initial[0]).toMatchObject({ current: true, remote: false });

      // createBranch checks out the new branch.
      await git.createBranch(repo, "feature");
      let branches = await git.branches(repo);
      expect(branches.find((b) => b.name === "feature")).toMatchObject({
        current: true,
      });
      expect(branches.find((b) => b.name === base)).toMatchObject({
        current: false,
      });

      // switchBranch moves HEAD back.
      await git.switchBranch(repo, base);
      branches = await git.branches(repo);
      expect(branches.find((b) => b.name === base)).toMatchObject({
        current: true,
      });

      // deleteBranch removes a (merged) branch.
      await git.deleteBranch(repo, "feature");
      expect((await git.branches(repo)).map((b) => b.name)).toEqual([base]);
    });

    it("renames a branch", async () => {
      await seedCommit();
      await git.createBranch(repo, "old-name");
      await git.renameBranch(repo, "old-name", "new-name");
      const names = (await git.branches(repo)).map((b) => b.name);
      expect(names).toContain("new-name");
      expect(names).not.toContain("old-name");
    });

    it("refuses to delete an unmerged branch without force", async () => {
      await seedCommit();
      const base = (await git.branches(repo)).find((b) => b.current)!.name;

      // Commit something only on the side branch so it isn't merged into base.
      await git.createBranch(repo, "wip");
      writeFileSync(join(repo, "b.txt"), "only-on-wip\n");
      await git.stage(repo, ["b.txt"]);
      await git.commit(repo, "wip work");
      await git.switchBranch(repo, base);

      await expect(git.deleteBranch(repo, "wip")).rejects.toThrow(
        /not fully merged/i,
      );
      // Force succeeds.
      await git.deleteBranch(repo, "wip", true);
      expect((await git.branches(repo)).map((b) => b.name)).not.toContain(
        "wip",
      );
    });

    it("reports unmerged commits for a branch (empty when merged)", async () => {
      await seedCommit();
      const base = (await git.branches(repo)).find((b) => b.current)!.name;

      // A branch with no extra commits is fully merged → nothing at risk.
      await git.createBranch(repo, "merged");
      await git.switchBranch(repo, base);
      expect(await git.unmergedCommits(repo, "merged")).toEqual([]);

      // A branch with a unique commit reports it as unmerged (vs HEAD/base).
      await git.createBranch(repo, "wip");
      writeFileSync(join(repo, "b.txt"), "only-on-wip\n");
      await git.stage(repo, ["b.txt"]);
      await git.commit(repo, "wip work");
      await git.switchBranch(repo, base);

      const unmerged = await git.unmergedCommits(repo, "wip");
      expect(unmerged).toHaveLength(1);
      expect(unmerged[0].subject).toBe("wip work");
    });

    it("falls back to HEAD when the branch's upstream ref can't be resolved", async () => {
      await seedCommit();
      const base = (await git.branches(repo)).find((b) => b.current)!.name;
      await git.createBranch(repo, "wip");
      writeFileSync(join(repo, "b.txt"), "only-on-wip\n");
      await git.stage(repo, ["b.txt"]);
      await git.commit(repo, "wip work");
      await git.switchBranch(repo, base);

      // A dangling upstream (e.g. a pruned remote-tracking branch) makes
      // `<upstream>..wip` error; we must fall back to HEAD and still surface the
      // unmerged commit rather than reporting the branch as safe to delete.
      const unmerged = await git.unmergedCommits(repo, "wip", "origin/gone");
      expect(unmerged).toHaveLength(1);
      expect(unmerged[0].subject).toBe("wip work");
    });

    it("fetch --prune drops remote-tracking branches deleted upstream", async () => {
      await seedCommit();
      const base = (await git.branches(repo)).find((b) => b.current)!.name;
      const remote = mkdtempSync(join(tmpdir(), "silo-gitremote-"));
      try {
        await realExec("git", ["init", "--bare", "-q"], { cwd: remote });
        await realExec("git", ["remote", "add", "origin", remote], {
          cwd: repo,
        });
        await realExec("git", ["push", "-q", "origin", base], { cwd: repo });

        // Push a branch, then fetch so its remote-tracking ref exists locally.
        await git.createBranch(repo, "temp");
        await realExec("git", ["push", "-q", "origin", "temp"], { cwd: repo });
        await git.switchBranch(repo, base);
        await git.fetch(repo, false);
        expect((await git.branches(repo)).map((b) => b.name)).toContain(
          "origin/temp",
        );

        // Delete it directly on the remote (as another clone would) so this
        // clone's `origin/temp` tracking ref is now stale — still listed…
        await realExec("git", ["branch", "-D", "temp"], { cwd: remote });
        expect((await git.branches(repo)).map((b) => b.name)).toContain(
          "origin/temp",
        );

        // …until fetch --prune reconciles and removes it.
        await git.fetch(repo, true);
        expect((await git.branches(repo)).map((b) => b.name)).not.toContain(
          "origin/temp",
        );
      } finally {
        rmSync(remote, { recursive: true, force: true });
      }
    });

    it("pushes a branch and sets its upstream on first push", async () => {
      await seedCommit();
      const base = (await git.branches(repo)).find((b) => b.current)!.name;
      const remote = mkdtempSync(join(tmpdir(), "silo-gitremote-"));
      try {
        await realExec("git", ["init", "--bare", "-q"], { cwd: remote });
        await realExec("git", ["remote", "add", "origin", remote], {
          cwd: repo,
        });

        // First push of the current branch: publishes it and sets tracking.
        await git.push(repo, { setUpstream: true });
        expect(
          (await git.branches(repo)).find((b) => b.name === base)?.upstream,
        ).toBe(`origin/${base}`);

        // Push a different local branch by name (without checking it out).
        await git.createBranch(repo, "feature");
        writeFileSync(join(repo, "f.txt"), "x\n");
        await git.stage(repo, ["f.txt"]);
        await git.commit(repo, "feature work");
        await git.switchBranch(repo, base);
        await git.push(repo, {
          branch: "feature",
          remote: "origin",
          setUpstream: true,
        });
        const { stdout } = await realExec("git", ["branch"], { cwd: remote });
        expect(stdout).toContain("feature");
      } finally {
        rmSync(remote, { recursive: true, force: true });
      }
    });

    it("pulls (fast-forward) commits added upstream", async () => {
      await seedCommit();
      const base = (await git.branches(repo)).find((b) => b.current)!.name;
      const remote = mkdtempSync(join(tmpdir(), "silo-gitremote-"));
      const other = mkdtempSync(join(tmpdir(), "silo-gitclone-"));
      try {
        await realExec("git", ["init", "--bare", "-q"], { cwd: remote });
        await realExec("git", ["remote", "add", "origin", remote], {
          cwd: repo,
        });
        // Publish base and set tracking, so pull knows its upstream.
        await git.push(repo, { setUpstream: true });

        // A second clone advances the branch on the remote.
        await realExec("git", ["clone", "-q", remote, other], {});
        await realExec("git", ["config", "user.email", "t@t"], { cwd: other });
        await realExec("git", ["config", "user.name", "t"], { cwd: other });
        writeFileSync(join(other, "upstream.txt"), "from elsewhere\n");
        await realExec("git", ["add", "."], { cwd: other });
        await realExec("git", ["commit", "-q", "-m", "remote commit"], {
          cwd: other,
        });
        await realExec("git", ["push", "-q", "origin", base], { cwd: other });

        // repo is now behind; a fast-forward pull brings the commit in.
        await git.pull(repo);
        expect(existsSync(join(repo, "upstream.txt"))).toBe(true);
        const { stdout } = await realExec("git", ["log", "--oneline"], {
          cwd: repo,
        });
        expect(stdout).toContain("remote commit");
      } finally {
        rmSync(remote, { recursive: true, force: true });
        rmSync(other, { recursive: true, force: true });
      }
    });

    // Git reports worktree paths realpath'd (on macOS, tmpdir() is a symlink into
    // /private/...), so expectations resolve through realpathSync too — this pins
    // the mismatch the panel's samePath() normalization exists for.
    const real = (p: string) => realpathSync(p).replace(/\\/g, "/");

    it("lists worktrees (main first) and creates one on a new branch", async () => {
      await seedCommit();

      let wts = await git.worktrees(repo);
      expect(wts).toHaveLength(1);
      expect(wts[0]).toMatchObject({ isMain: true, bare: false });
      expect(wts[0].path).toBe(real(repo));

      const wtPath = join(tmpdir(), `silo-gitwt-${Date.now()}`);
      try {
        await git.addWorktree(repo, wtPath, { newBranch: "feat/x" });
        wts = await git.worktrees(repo);
        expect(wts).toHaveLength(2);
        expect(wts[0].isMain).toBe(true);
        const linked = wts[1];
        expect(linked.isMain).toBe(false);
        expect(linked.branch).toBe("feat/x");
        expect(linked.path).toBe(real(wtPath));

        // The family is visible from the linked worktree too, same order.
        const fromLinked = await git.worktrees(wtPath);
        expect(fromLinked.map((w) => w.path)).toEqual(wts.map((w) => w.path));
      } finally {
        rmSync(wtPath, { recursive: true, force: true });
      }
    });

    it("creates a worktree for an existing branch, refuses one already checked out", async () => {
      await seedCommit();
      const base = (await git.branches(repo)).find((b) => b.current)!.name;
      await git.createBranch(repo, "other");
      await git.switchBranch(repo, base);

      const wtPath = join(tmpdir(), `silo-gitwt-${Date.now()}`);
      try {
        await git.addWorktree(repo, wtPath, { branch: "other" });
        const wts = await git.worktrees(repo);
        expect(wts.find((w) => w.branch === "other")?.path).toBe(real(wtPath));

        // `base` is checked out in the main worktree — git refuses a second one.
        const wtPath2 = join(tmpdir(), `silo-gitwt2-${Date.now()}`);
        await expect(
          git.addWorktree(repo, wtPath2, { branch: base }),
        ).rejects.toThrow(/already checked out|already used by worktree/i);
      } finally {
        rmSync(wtPath, { recursive: true, force: true });
      }
    });

    it("removes a worktree: refuses dirty without force, keeps the branch", async () => {
      await seedCommit();
      const wtPath = join(tmpdir(), `silo-gitwt-${Date.now()}`);
      try {
        await git.addWorktree(repo, wtPath, { newBranch: "wt-branch" });
        writeFileSync(join(wtPath, "scratch.txt"), "dirty\n");

        await expect(git.removeWorktree(repo, wtPath)).rejects.toThrow(
          /contains modified or untracked files|use --force/i,
        );
        expect(existsSync(wtPath)).toBe(true);

        await git.removeWorktree(repo, wtPath, true);
        expect(existsSync(wtPath)).toBe(false);
        expect(await git.worktrees(repo)).toHaveLength(1);
        // The branch survives the worktree's removal.
        expect((await git.branches(repo)).map((b) => b.name)).toContain(
          "wt-branch",
        );
      } finally {
        rmSync(wtPath, { recursive: true, force: true });
      }
    });

    it("flags a deleted worktree as prunable and prunes it", async () => {
      await seedCommit();
      const wtPath = join(tmpdir(), `silo-gitwt-${Date.now()}`);
      await git.addWorktree(repo, wtPath, { newBranch: "gone" });
      // Delete the directory out from under git (as `rm -rf` would).
      rmSync(wtPath, { recursive: true, force: true });

      const stale = (await git.worktrees(repo)).find((w) => !w.isMain);
      expect(stale?.prunable).toBeTruthy();

      await git.pruneWorktrees(repo);
      expect(await git.worktrees(repo)).toHaveLength(1);
    });

    it("worktrees resolves to an empty list outside a repository", async () => {
      const outside = mkdtempSync(join(tmpdir(), "silo-norepo-"));
      try {
        expect(await git.worktrees(outside)).toEqual([]);
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });

    it("rejects a fast-forward pull when the branch has diverged", async () => {
      await seedCommit();
      const base = (await git.branches(repo)).find((b) => b.current)!.name;
      const remote = mkdtempSync(join(tmpdir(), "silo-gitremote-"));
      const other = mkdtempSync(join(tmpdir(), "silo-gitclone-"));
      try {
        await realExec("git", ["init", "--bare", "-q"], { cwd: remote });
        await realExec("git", ["remote", "add", "origin", remote], {
          cwd: repo,
        });
        await git.push(repo, { setUpstream: true });

        // The remote advances…
        await realExec("git", ["clone", "-q", remote, other], {});
        await realExec("git", ["config", "user.email", "t@t"], { cwd: other });
        await realExec("git", ["config", "user.name", "t"], { cwd: other });
        writeFileSync(join(other, "remote.txt"), "remote side\n");
        await realExec("git", ["add", "."], { cwd: other });
        await realExec("git", ["commit", "-q", "-m", "remote commit"], {
          cwd: other,
        });
        await realExec("git", ["push", "-q", "origin", base], { cwd: other });

        // …while repo makes its own commit — now the histories have diverged.
        writeFileSync(join(repo, "local.txt"), "local side\n");
        await git.stage(repo, ["local.txt"]);
        await git.commit(repo, "local commit");

        // --ff-only can't reconcile a divergence, so it must reject (no merge).
        await expect(git.pull(repo)).rejects.toThrow();
      } finally {
        rmSync(remote, { recursive: true, force: true });
        rmSync(other, { recursive: true, force: true });
      }
    });
  },
);

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
  renameSync,
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

    it("log reports each commit's filesChanged count (--numstat, no extra request)", async () => {
      writeFileSync(join(repo, "a.txt"), "v1\n");
      writeFileSync(join(repo, "b.txt"), "v1\n");
      await git.stage(repo, ["a.txt", "b.txt"]);
      await git.commit(repo, "two files");

      const log = await git.log(repo);
      expect(log[0]).toMatchObject({ subject: "two files", filesChanged: 2 });
    });

    it("commitCount reports HEAD's full ancestry with no base, and just the range with one", async () => {
      await seedCommit();

      await git.createBranch(repo, "feature");
      writeFileSync(join(repo, "f.txt"), "x\n");
      await git.stage(repo, ["f.txt"]);
      await git.commit(repo, "feature work 1");
      writeFileSync(join(repo, "f.txt"), "y\n");
      await git.stage(repo, ["f.txt"]);
      await git.commit(repo, "feature work 2");

      expect(await git.commitCount(repo)).toBe(3);
      const branchBase = await git.branchBase(repo, "feature");
      expect(await git.commitCount(repo, branchBase!)).toBe(2);
    });

    it("commitCount resolves to 0 outside a repository", async () => {
      const outside = mkdtempSync(join(tmpdir(), "silo-norepo-"));
      try {
        expect(await git.commitCount(outside)).toBe(0);
      } finally {
        rmSync(outside, { recursive: true, force: true });
      }
    });

    it("log counts a merge commit's filesChanged against its first parent", async () => {
      await seedCommit();
      const base = (await git.branches(repo)).find((b) => b.current)!.name;

      await git.createBranch(repo, "side");
      writeFileSync(join(repo, "b.txt"), "from side\n");
      await git.stage(repo, ["b.txt"]);
      await git.commit(repo, "add b on side");
      await git.switchBranch(repo, base);

      writeFileSync(join(repo, "c.txt"), "from base\n");
      await git.stage(repo, ["c.txt"]);
      await git.commit(repo, "add c on base");
      await realExec("git", ["merge", "--no-ff", "-m", "merge side", "side"], {
        cwd: repo,
      });

      const log = await git.log(repo);
      const mergeEntry = log.find((c) => c.subject === "merge side")!;
      // First-parent diff: only b.txt (what the merge itself brought in) —
      // not c.txt, already on the mainline before the merge.
      expect(mergeEntry.filesChanged).toBe(1);
    });

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

    it("branchBase resolves to null when branch is the default branch", async () => {
      await seedCommit();
      const base = (await git.branches(repo)).find((b) => b.current)!.name;
      expect(await git.branchBase(repo, base)).toBeNull();
    });

    it("branchBase resolves to null when no default branch can be found", async () => {
      await seedCommit();
      const base = (await git.branches(repo)).find((b) => b.current)!.name;
      await git.renameBranch(repo, base, "trunk");
      expect(await git.branchBase(repo, "trunk")).toBeNull();
    });

    it("branchBase computes the merge-base for a feature branch off the default branch (falling back to a local main/master)", async () => {
      await seedCommit();
      const base = (await git.branches(repo)).find((b) => b.current)!.name;
      const { stdout: forkPoint } = await realExec(
        "git",
        ["rev-parse", "HEAD"],
        {
          cwd: repo,
        },
      );

      await git.createBranch(repo, "feature");
      writeFileSync(join(repo, "f.txt"), "x\n");
      await git.stage(repo, ["f.txt"]);
      await git.commit(repo, "feature work");

      // The default branch (base) hasn't moved since the fork, so the
      // merge-base is exactly where "feature" branched off.
      expect(await git.branchBase(repo, "feature")).toBe(forkPoint.trim());
    });

    it("branchBase prefers origin/HEAD when a remote's default branch is configured", async () => {
      await seedCommit();
      const base = (await git.branches(repo)).find((b) => b.current)!.name;
      const remote = mkdtempSync(join(tmpdir(), "silo-gitremote-"));
      try {
        await realExec("git", ["init", "--bare", "-q"], { cwd: remote });
        await realExec("git", ["remote", "add", "origin", remote], {
          cwd: repo,
        });
        await realExec("git", ["push", "-q", "origin", base], { cwd: repo });
        await realExec("git", ["remote", "set-head", "origin", base], {
          cwd: repo,
        });
        const { stdout: forkPoint } = await realExec(
          "git",
          ["rev-parse", "HEAD"],
          { cwd: repo },
        );

        await git.createBranch(repo, "feature");
        writeFileSync(join(repo, "f.txt"), "x\n");
        await git.stage(repo, ["f.txt"]);
        await git.commit(repo, "feature work");

        expect(await git.branchBase(repo, "feature")).toBe(forkPoint.trim());
      } finally {
        rmSync(remote, { recursive: true, force: true });
      }
    });

    it("log(base) scopes commits to just the branch, matching GitHub's PR Commits tab", async () => {
      await seedCommit();
      const base = (await git.branches(repo)).find((b) => b.current)!.name;

      await git.createBranch(repo, "feature");
      writeFileSync(join(repo, "f.txt"), "x\n");
      await git.stage(repo, ["f.txt"]);
      await git.commit(repo, "feature work 1");
      writeFileSync(join(repo, "f.txt"), "y\n");
      await git.stage(repo, ["f.txt"]);
      await git.commit(repo, "feature work 2");

      const branchBase = await git.branchBase(repo, "feature");
      expect(branchBase).not.toBeNull();
      const scoped = await git.log(repo, 50, branchBase!);
      expect(scoped.map((c) => c.subject)).toEqual([
        "feature work 2",
        "feature work 1",
      ]);

      // Unscoped, the shared history with `base` (the seed commit) is
      // included too — the exact confusion this feature exists to avoid.
      const unscoped = await git.log(repo, 50);
      expect(unscoped.map((c) => c.subject)).toEqual([
        "feature work 2",
        "feature work 1",
        "init",
      ]);
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

    it("refuses to remove a locked worktree until it is unlocked", async () => {
      await seedCommit();
      const wtPath = join(tmpdir(), `silo-gitwt-${Date.now()}`);
      try {
        await git.addWorktree(repo, wtPath, { newBranch: "locked-branch" });
        await realExec(
          "git",
          ["worktree", "lock", "--reason", "pinned by CI", wtPath],
          { cwd: repo },
        );
        expect((await git.worktrees(repo)).find((w) => !w.isMain)?.locked).toBe(
          "pinned by CI",
        );

        // Pins the message confirmAndRemoveWorktree's LOCKED_RE matches on —
        // and that `force` alone doesn't get past a lock.
        await expect(git.removeWorktree(repo, wtPath, true)).rejects.toThrow(
          /locked working tree/i,
        );
        expect(existsSync(wtPath)).toBe(true);

        await git.unlockWorktree(repo, wtPath);
        expect((await git.worktrees(repo)).find((w) => !w.isMain)?.locked).toBe(
          null,
        );
        await git.removeWorktree(repo, wtPath);
        expect(existsSync(wtPath)).toBe(false);
      } finally {
        rmSync(wtPath, { recursive: true, force: true });
      }
    });

    it("reports a lock ahead of uncommitted changes on the same worktree", async () => {
      await seedCommit();
      const wtPath = join(tmpdir(), `silo-gitwt-${Date.now()}`);
      try {
        await git.addWorktree(repo, wtPath, { newBranch: "locked-dirty" });
        writeFileSync(join(wtPath, "scratch.txt"), "dirty\n");
        await realExec("git", ["worktree", "lock", wtPath], { cwd: repo });

        // Why confirmAndRemoveWorktree can't clear the lock only once it knows
        // the removal will otherwise succeed: git stops at the lock and never
        // gets as far as looking at the working tree, so "is it also dirty?"
        // is unanswerable until the lock is off.
        await expect(git.removeWorktree(repo, wtPath)).rejects.toThrow(
          /locked working tree/i,
        );
        await git.unlockWorktree(repo, wtPath);
        await expect(git.removeWorktree(repo, wtPath)).rejects.toThrow(
          /contains modified or untracked files|use --force/i,
        );

        // …which is why the remove flow can put the lock back: same reason,
        // same refusal, as if the abandoned removal had never run.
        await git.lockWorktree(repo, wtPath, "pinned by CI");
        expect((await git.worktrees(repo)).find((w) => !w.isMain)?.locked).toBe(
          "pinned by CI",
        );
        await expect(git.removeWorktree(repo, wtPath)).rejects.toThrow(
          /locked working tree/i,
        );
      } finally {
        rmSync(wtPath, { recursive: true, force: true });
      }
    });

    it("locks a worktree with no reason at all", async () => {
      await seedCommit();
      const wtPath = join(tmpdir(), `silo-gitwt-${Date.now()}`);
      try {
        await git.addWorktree(repo, wtPath, { newBranch: "lock-noreason" });
        await git.lockWorktree(repo, wtPath);
        // `""`, not null: locked, but without a reason to show.
        expect((await git.worktrees(repo)).find((w) => !w.isMain)?.locked).toBe(
          "",
        );
        await expect(git.lockWorktree(repo, wtPath)).rejects.toThrow(
          /already locked/i,
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

    it("commitDetail resolves a root commit's files against the empty tree", async () => {
      writeFileSync(join(repo, "a.txt"), "hello\n");
      await git.stage(repo, ["a.txt"]);
      await git.commit(repo, "root commit\n\nSome body text.");

      const log = await git.log(repo);
      const detail = await git.commitDetail(repo, log[0].hash);
      expect(detail).toMatchObject({
        subject: "root commit",
        body: "Some body text.",
        parents: [],
      });
      expect(detail!.files).toEqual([
        {
          path: "a.txt",
          origPath: undefined,
          status: "A",
          binary: false,
          additions: 1,
          deletions: 0,
        },
      ]);
    });

    it("commitDetail resolves an ordinary commit's files against its single parent", async () => {
      await seedCommit();
      writeFileSync(join(repo, "a.txt"), "v1\nv2\n");
      await git.stage(repo, ["a.txt"]);
      await git.commit(repo, "update a");

      const log = await git.log(repo);
      const detail = await git.commitDetail(repo, log[0].hash);
      expect(detail!.parents).toHaveLength(1);
      expect(detail!.files).toEqual([
        {
          path: "a.txt",
          origPath: undefined,
          status: "M",
          binary: false,
          additions: 1,
          deletions: 0,
        },
      ]);
    });

    it("commitDetail reports a rename with its origin path", async () => {
      await seedCommit();
      renameSync(join(repo, "a.txt"), join(repo, "renamed.txt"));
      await git.stage(repo, ["a.txt", "renamed.txt"]);
      await git.commit(repo, "rename a");

      const log = await git.log(repo);
      const detail = await git.commitDetail(repo, log[0].hash);
      expect(detail!.files).toEqual([
        expect.objectContaining({
          path: "renamed.txt",
          origPath: "a.txt",
          status: "R",
        }),
      ]);
    });

    it("commitDetail resolves a merge commit's files against its first parent only", async () => {
      await seedCommit();
      const base = (await git.branches(repo)).find((b) => b.current)!.name;

      // Side branch adds b.txt.
      await git.createBranch(repo, "side");
      writeFileSync(join(repo, "b.txt"), "from side\n");
      await git.stage(repo, ["b.txt"]);
      await git.commit(repo, "add b on side");
      await git.switchBranch(repo, base);

      // Mainline adds c.txt, then merges side in.
      writeFileSync(join(repo, "c.txt"), "from base\n");
      await git.stage(repo, ["c.txt"]);
      await git.commit(repo, "add c on base");
      await realExec("git", ["merge", "--no-ff", "-m", "merge side", "side"], {
        cwd: repo,
      });

      const log = await git.log(repo);
      const mergeCommit = log.find((c) => c.subject === "merge side")!;
      const detail = await git.commitDetail(repo, mergeCommit.hash);
      expect(detail!.parents).toHaveLength(2);
      // First-parent diff: only what the merge itself brought in (b.txt from
      // the side branch) — not c.txt, which was already on the mainline.
      expect(detail!.files.map((f) => f.path)).toEqual(["b.txt"]);
    });

    it("commitDetail resolves to null for an unknown hash", async () => {
      await seedCommit();
      expect(await git.commitDetail(repo, "0".repeat(40))).toBeNull();
    });

    it("isBinaryDiff detects a binary file in each mode", async () => {
      await seedCommit();
      const binary = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02]);
      writeFileSync(join(repo, "img.png"), binary);
      await git.stage(repo, ["img.png"]);

      // staged: HEAD (missing) vs the index.
      expect(await git.isBinaryDiff(repo, "img.png", "staged")).toBe(true);
      await git.commit(repo, "add binary");

      // workingTree: no further changes, so nothing to diff, but a modified
      // binary working-tree file still reports as binary.
      writeFileSync(join(repo, "img.png"), Buffer.concat([binary, binary]));
      expect(await git.isBinaryDiff(repo, "img.png", "workingTree")).toBe(true);

      // commit: the add-binary commit vs. its parent.
      const log = await git.log(repo);
      const addCommit = log.find((c) => c.subject === "add binary")!;
      expect(
        await git.isBinaryDiff(repo, "img.png", "commit", {
          commit: addCommit.hash,
          parent: addCommit.hash + "^",
        }),
      ).toBe(true);
    });

    it("isBinaryDiff reports false for an ordinary text file", async () => {
      await seedCommit();
      writeFileSync(join(repo, "a.txt"), "v2\n");
      expect(await git.isBinaryDiff(repo, "a.txt", "workingTree")).toBe(false);
    });

    it("remotes reads back what `git remote add` configured", async () => {
      await realExec(
        "git",
        ["remote", "add", "origin", "git@github.com:silo-code/silo.git"],
        { cwd: repo },
      );
      expect(await git.remotes(repo)).toEqual([
        {
          name: "origin",
          fetchUrl: "git@github.com:silo-code/silo.git",
          pushUrl: "git@github.com:silo-code/silo.git",
        },
      ]);
    });

    it("remotes separates a configured pushurl from the fetch url", async () => {
      await realExec(
        "git",
        ["remote", "add", "origin", "https://github.com/silo-code/silo.git"],
        { cwd: repo },
      );
      await realExec(
        "git",
        [
          "remote",
          "set-url",
          "--push",
          "origin",
          "git@github.com:silo-code/silo.git",
        ],
        { cwd: repo },
      );
      expect(await git.remotes(repo)).toEqual([
        {
          name: "origin",
          fetchUrl: "https://github.com/silo-code/silo.git",
          pushUrl: "git@github.com:silo-code/silo.git",
        },
      ]);
    });

    it("remotes resolves to an empty array with no remotes configured", async () => {
      expect(await git.remotes(repo)).toEqual([]);
    });

    it("remotes resolves to an empty array outside a repository", async () => {
      const plain = mkdtempSync(join(tmpdir(), "silo-nonrepo-"));
      try {
        expect(await git.remotes(plain)).toEqual([]);
      } finally {
        rmSync(plain, { recursive: true, force: true });
      }
    });
  },
);

// A missing `cwd` fails the process spawn itself and *rejects* — unlike a
// normal git failure, which resolves with a non-zero code (see the ExecFn
// contract note atop this file). The real-git contract tests above can't
// exercise that path (Node's execFile masks it as a non-zero exit), so this
// is a focused mock-`ExecFn` test for status()'s handling of the rejection.
describe("GitService.status against a rejecting exec (e.g. missing cwd)", () => {
  it("treats 'no such file or directory' as a missing folder, not a throw", async () => {
    const execRejects: ExecFn = () =>
      Promise.reject(
        new Error("failed to run git: No such file or directory (os error 2)"),
      );
    const git = createGitService(execRejects);
    const s = await git.status("/gone");
    expect(s).toEqual({
      branch: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      files: [],
      inRepo: false,
      missing: true,
    });
  });

  it("still throws for other spawn failures (e.g. git not installed)", async () => {
    const execRejects: ExecFn = () =>
      Promise.reject(new Error("failed to run git: permission denied"));
    const git = createGitService(execRejects);
    await expect(git.status("/somewhere")).rejects.toThrow("permission denied");
  });

  // On some platforms git *spawns* fine against a since-deleted cwd and exits
  // non-zero with this message instead of the spawn rejecting — the same
  // missing-folder case, so it must map to `missing`, not a thrown toast.
  it("treats a non-zero 'unable to read current working directory' as missing", async () => {
    const execExitsNonZero: ExecFn = () =>
      Promise.resolve({
        stdout: "",
        stderr:
          "fatal: unable to read current working directory: No such file or directory",
        code: 128,
      });
    const git = createGitService(execExitsNonZero);
    const s = await git.status("/gone");
    expect(s).toEqual({
      branch: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      files: [],
      inRepo: false,
      missing: true,
    });
  });

  it("keeps 'not a git repository' as inRepo:false without the missing flag", async () => {
    const execNotRepo: ExecFn = () =>
      Promise.resolve({
        stdout: "",
        stderr:
          "fatal: not a git repository (or any of the parent directories)",
        code: 128,
      });
    const git = createGitService(execNotRepo);
    const s = await git.status("/plain-dir");
    expect(s.inRepo).toBe(false);
    expect(s.missing).toBeUndefined();
  });
});

// worktrees() shares status()'s missing-cwd handling — a background read (fs
// watch, autofetch, or the tracker's initial read) races an external delete
// of the folder (e.g. a worktree removed outside Silo) just as easily on this
// call as on status().
describe("GitService.worktrees against a rejecting exec (e.g. missing cwd)", () => {
  it("treats 'no such file or directory' as no worktrees, not a throw", async () => {
    const execRejects: ExecFn = () =>
      Promise.reject(
        new Error("failed to run git: No such file or directory (os error 2)"),
      );
    const git = createGitService(execRejects);
    await expect(git.worktrees("/gone")).resolves.toEqual([]);
  });

  it("still throws for other spawn failures (e.g. git not installed)", async () => {
    const execRejects: ExecFn = () =>
      Promise.reject(new Error("failed to run git: permission denied"));
    const git = createGitService(execRejects);
    await expect(git.worktrees("/somewhere")).rejects.toThrow(
      "permission denied",
    );
  });
});

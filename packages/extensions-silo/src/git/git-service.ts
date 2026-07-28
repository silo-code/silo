import type { GitAPI, GitLogEntry, GitStatus } from "./git-api";
import { parseGitStatus } from "./parse-status";
import { parseBranches } from "./parse-branches";
import { parseWorktrees } from "./parse-worktrees";
import {
  mergeCommitFiles,
  parseNameStatus,
  parseNumstat,
  resolveDiffBase,
} from "./parse-commit-files";

// The GitAPI implementation, built on a generic one-shot `exec` (ctx.process.exec
// in the app; a real-git wrapper in the contract test). This is the whole point
// of the split: git is `exec("git", […], { cwd })` + pure parsing, with no
// privileged host access of its own — so it's an extension, not core. `exec` is
// injected rather than imported so the service is unit-testable against a temp
// repo without the running app.

const TAB = "\t";

/** The subset of `ctx.process.exec` the git service needs. */
export type ExecFn = (
  command: string,
  args: string[],
  options?: { cwd?: string },
) => Promise<{ stdout: string; stderr: string; code: number }>;

// A commit header line — the %H%x09... pretty-format row — vs. a trailing
// --numstat line ("<add>\t<del>\t<path>", or "-\t-\t<path>" for binary). The
// 40-hex-char-then-tab shape only ever starts a header, so header lines are
// unambiguous even interleaved with each commit's own numstat block.
const LOG_HEADER_RE = /^[0-9a-f]{40}\t/;

// A working directory that's gone from disk surfaces two ways, depending on the
// platform and git version: the process *spawn* rejects ("No such file or
// directory"), or git spawns fine but exits non-zero with "fatal: unable to
// read current working directory: No such file or directory". Both mean the
// same thing — treat either as a graceful `missing` status instead of throwing
// the raw OS error as a toast on every background refresh (see `status`).
const MISSING_CWD_RE =
  /no such file or directory|unable to read current working directory/i;

/** A folder that no longer exists on disk — `inRepo: false` plus `missing`. */
function missingStatus(): GitStatus {
  return {
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    files: [],
    inRepo: false,
    missing: true,
  };
}

/** A folder that exists but isn't a git repository. */
function notARepoStatus(): GitStatus {
  return {
    branch: null,
    upstream: null,
    ahead: 0,
    behind: 0,
    files: [],
    inRepo: false,
  };
}

/** Parses `git log --pretty=format:%H%x09%h%x09%an%x09%ar%x09%s --numstat
 * [--diff-merges=first-parent]` output — the file lines under each header
 * count that commit's `filesChanged`, with no extra request per commit. */
function parseLog(raw: string): GitLogEntry[] {
  const entries: GitLogEntry[] = [];
  let current: GitLogEntry | null = null;
  for (const line of raw.split("\n")) {
    if (LOG_HEADER_RE.test(line)) {
      const [hash, shortHash, author, relativeDate, ...rest] = line.split(TAB);
      current = {
        hash: hash ?? "",
        shortHash: shortHash ?? "",
        author: author ?? "",
        relativeDate: relativeDate ?? "",
        subject: rest.join(TAB),
        filesChanged: 0,
      };
      entries.push(current);
    } else if (line.trim() && current) {
      current.filesChanged++;
    }
  }
  return entries;
}

/** Build a {@link GitAPI} backed by the given one-shot `exec`. */
export function createGitService(exec: ExecFn): GitAPI {
  // `--no-optional-locks` keeps background reads (status/log/diff/branches),
  // which the panel polls on a file-watch, from taking git's *optional* index
  // lock — so a poll mid-commit can't collide with the lock the commit (and its
  // pre-commit hooks) hold and fail with "Unable to create index.lock". It's a
  // top-level flag, harmless on the mutating commands (they use required locks),
  // so it's applied to every invocation.
  const git = (cwd: string, args: string[]) =>
    exec("git", ["--no-optional-locks", ...args], { cwd });

  // Mutating commands: succeed silently, throw the stderr on failure (the old
  // run_git rejected on non-zero, and the view surfaces the message).
  async function run(cwd: string, args: string[]): Promise<void> {
    const { stderr, code } = await git(cwd, args);
    if (code !== 0) throw new Error(stderr.trim() || `git ${args[0]} failed`);
  }

  return {
    async status(cwd) {
      let stdout: string, stderr: string, code: number;
      try {
        ({ stdout, stderr, code } = await git(cwd, [
          "status",
          "--porcelain=v2",
          "-b",
          // Expand untracked directories into their files (don't collapse a
          // whole untracked subtree into one `directory/` row).
          "--untracked-files=all",
        ]));
      } catch (err) {
        // A missing `cwd` fails the process spawn itself and rejects — e.g. a
        // worktree or extra folder deleted outside Silo (ADR 0025-adjacent:
        // Silo can't watch for that). Treat it as `missing` instead of throwing
        // the raw OS error on every background refresh.
        if (MISSING_CWD_RE.test(String(err))) return missingStatus();
        throw err;
      }
      if (code !== 0) {
        // On some platforms git spawns fine against a since-deleted cwd and
        // instead exits non-zero with "unable to read current working
        // directory" — the same missing-folder case, so handle it the same way.
        if (MISSING_CWD_RE.test(stderr)) return missingStatus();
        if (stderr.includes("not a git repository")) return notARepoStatus();
        throw new Error(stderr.trim() || "git status failed");
      }
      return parseGitStatus(stdout);
    },

    async log(cwd, limit = 50, base) {
      const { stdout, code } = await git(cwd, [
        "log",
        "--pretty=format:%H%x09%h%x09%an%x09%ar%x09%s",
        "--numstat",
        "--diff-merges=first-parent",
        `-${limit}`,
        ...(base ? [`${base}..HEAD`] : []),
      ]);
      // Any error (e.g. empty repo with no commits) → no history.
      if (code !== 0) return [];
      return parseLog(stdout);
    },

    async commitCount(cwd, base) {
      const { stdout, code } = await git(cwd, [
        "rev-list",
        "--count",
        base ? `${base}..HEAD` : "HEAD",
      ]);
      if (code !== 0) return 0;
      const n = parseInt(stdout.trim(), 10);
      return Number.isFinite(n) ? n : 0;
    },

    async diff(cwd, path, staged = false) {
      const args = ["diff"];
      if (staged) args.push("--cached");
      if (path) args.push("--", path);
      const { stdout, stderr, code } = await git(cwd, args);
      if (code !== 0) throw new Error(stderr.trim() || "git diff failed");
      return stdout;
    },

    stage(cwd, paths) {
      return run(cwd, ["add", "--", ...paths]);
    },

    unstage(cwd, paths) {
      return run(cwd, ["restore", "--staged", "--", ...paths]);
    },

    commit(cwd, message) {
      return run(cwd, ["commit", "-m", message]);
    },

    async show(cwd, reference) {
      const { stdout, code } = await git(cwd, ["show", reference]);
      // Path didn't exist at that revision (e.g. an untracked file's HEAD
      // version) → treat as an empty file, matching the old git_show.
      if (code !== 0) return "";
      return stdout;
    },

    revertFile(cwd, paths) {
      return run(cwd, [
        "restore",
        "--source=HEAD",
        "--staged",
        "--worktree",
        "--",
        ...paths,
      ]);
    },

    clean(cwd, paths) {
      return run(cwd, ["clean", "-f", "--", ...paths]);
    },

    push(cwd, options) {
      // No options → push the current branch to its configured upstream.
      if (!options?.branch && !options?.remote && !options?.setUpstream) {
        return run(cwd, ["push"]);
      }
      const args = ["push"];
      if (options.setUpstream) args.push("--set-upstream");
      args.push(options.remote ?? "origin", options.branch ?? "HEAD");
      return run(cwd, args);
    },

    async branches(cwd) {
      const { stdout, code } = await git(cwd, [
        "for-each-ref",
        "--format=%(refname)%09%(HEAD)%09%(upstream:short)",
        "refs/heads",
        "refs/remotes",
      ]);
      // Any error (e.g. an empty repo with no refs yet) → no branches.
      if (code !== 0) return [];
      return parseBranches(stdout);
    },

    fetch(cwd, prune) {
      return run(cwd, ["fetch", ...(prune ? ["--prune"] : [])]);
    },

    pull(cwd) {
      // Fast-forward only: never auto-create a merge commit or leave a
      // half-finished merge the panel can't resolve. A diverged branch makes
      // this fail, which the caller turns into a "resolve manually" toast.
      return run(cwd, ["pull", "--ff-only"]);
    },

    switchBranch(cwd, name) {
      return run(cwd, ["switch", name]);
    },

    createBranch(cwd, name, startPoint) {
      return run(cwd, [
        "switch",
        "-c",
        name,
        ...(startPoint ? [startPoint] : []),
      ]);
    },

    deleteBranch(cwd, name, force) {
      return run(cwd, ["branch", force ? "-D" : "-d", name]);
    },

    renameBranch(cwd, oldName, newName) {
      return run(cwd, ["branch", "-m", oldName, newName]);
    },

    async unmergedCommits(cwd, branch, upstream) {
      // `<target>..<branch>` lists commits reachable from branch but not target;
      // empty ⇔ branch is fully merged into target ⇔ `git branch -d` would
      // succeed. Mirror git's delete-safety check: prefer the upstream, but if
      // that ref can't be resolved (a pruned/renamed remote-tracking branch
      // whose `branch.*.merge` config lingers) fall back to HEAD — otherwise
      // we'd report "nothing at risk", pick `-d`, and hit git's raw "not fully
      // merged" error instead of offering a force-delete.
      const ranges = upstream
        ? [`${upstream}..${branch}`, `HEAD..${branch}`]
        : [`HEAD..${branch}`];
      for (const range of ranges) {
        const { stdout, code } = await git(cwd, [
          "log",
          "--pretty=format:%H%x09%h%x09%an%x09%ar%x09%s",
          range,
        ]);
        if (code === 0) return parseLog(stdout);
      }
      return [];
    },

    async branchBase(cwd, branch) {
      // Prefer the remote's recorded default branch (`origin/HEAD`, set by
      // `git clone`/`git remote set-head`); fall back to the common default
      // names, remote-tracking ref first since it reflects the shared
      // history more reliably than a possibly-stale local branch.
      let defaultRef: string | null = null;
      const sym = await git(cwd, [
        "symbolic-ref",
        "--quiet",
        "--short",
        "refs/remotes/origin/HEAD",
      ]);
      if (sym.code === 0 && sym.stdout.trim()) {
        defaultRef = sym.stdout.trim();
      } else {
        for (const candidate of [
          "origin/main",
          "origin/master",
          "main",
          "master",
        ]) {
          const verify = await git(cwd, [
            "rev-parse",
            "--verify",
            "--quiet",
            candidate,
          ]);
          if (verify.code === 0) {
            defaultRef = candidate;
            break;
          }
        }
      }
      if (!defaultRef) return null;

      // Strip a remote prefix (`origin/main` → `main`) to compare against the
      // current branch's own short name.
      const defaultShortName = defaultRef.includes("/")
        ? defaultRef.slice(defaultRef.indexOf("/") + 1)
        : defaultRef;
      if (defaultShortName === branch) return null;

      const { stdout, code } = await git(cwd, [
        "merge-base",
        defaultRef,
        "HEAD",
      ]);
      if (code !== 0) return null;
      return stdout.trim() || null;
    },

    async commitDetail(cwd, hash) {
      const { stdout: metaLine, code: metaCode } = await git(cwd, [
        "show",
        "-s",
        "--pretty=format:%H%x09%h%x09%an%x09%ar%x09%P%x09%s%x09%b",
        hash,
      ]);
      if (metaCode !== 0 || !metaLine) return null;
      const [
        h,
        shortHash,
        author,
        relativeDate,
        parentsRaw,
        subject,
        ...bodyParts
      ] = metaLine.split(TAB);
      const parents = (parentsRaw ?? "").split(" ").filter(Boolean);
      const base = resolveDiffBase(parents);

      const [nameStatusResult, numstatResult] = await Promise.all([
        git(cwd, [
          "diff-tree",
          "--no-commit-id",
          "-r",
          "-M",
          "--name-status",
          base,
          hash,
        ]),
        git(cwd, [
          "diff-tree",
          "--no-commit-id",
          "-r",
          "--numstat",
          base,
          hash,
        ]),
      ]);
      const files = mergeCommitFiles(
        parseNameStatus(nameStatusResult.stdout),
        parseNumstat(numstatResult.stdout),
      );

      return {
        hash: h ?? hash,
        shortHash: shortHash ?? "",
        author: author ?? "",
        relativeDate: relativeDate ?? "",
        subject: subject ?? "",
        filesChanged: files.length,
        body: bodyParts.join(TAB).trim(),
        parents,
        files,
      };
    },

    async isBinaryDiff(cwd, path, mode, ref) {
      const args = ["diff", "--numstat"];
      if (mode === "workingTree") args.push("HEAD");
      else if (mode === "staged") args.push("--cached");
      else if (mode === "commit" && ref) args.push(ref.parent, ref.commit);
      args.push("--", path);
      const { stdout, code } = await git(cwd, args);
      if (code !== 0) return false;
      return /^-\t-\t/.test(stdout);
    },

    async worktrees(cwd) {
      const { stdout, code } = await git(cwd, [
        "worktree",
        "list",
        "--porcelain",
      ]);
      // Any error (e.g. not a git repository) → no worktrees.
      if (code !== 0) return [];
      return parseWorktrees(stdout);
    },

    addWorktree(cwd, path, options) {
      // Existing branch: `worktree add <path> <branch>`; new branch:
      // `worktree add -b <name> <path> [startPoint]`. Note the created path may
      // lie outside the workspace's scope roots — fine for the bundled (unscoped)
      // silo.git, but a scoped third-party git extension couldn't exec there.
      return run(
        cwd,
        "branch" in options
          ? ["worktree", "add", path, options.branch]
          : [
              "worktree",
              "add",
              "-b",
              options.newBranch,
              path,
              ...(options.startPoint ? [options.startPoint] : []),
            ],
      );
    },

    removeWorktree(cwd, path, force) {
      return run(cwd, [
        "worktree",
        "remove",
        ...(force ? ["--force"] : []),
        path,
      ]);
    },

    pruneWorktrees(cwd) {
      return run(cwd, ["worktree", "prune"]);
    },
  };
}

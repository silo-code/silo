// The `silo.git` provider's public contract — the shape a `@silo-code/git-api` types
// package would export. Consumers (the git-explorer view, the diff editor) import
// these types at build time and retrieve the live implementation at runtime via
// `ctx.getExtension<GitAPI>("silo.git").api`. Deliberately NOT re-exported from
// the core SDK barrel: git is an extension-owned feature, not a core primitive,
// so its API ships with the extension (see ctx-domains.md → Tier 2).

/** One file's status within a working tree, decoded from `git status`. */
export interface GitFileStatus {
  path: string;
  /** Raw staged (index) status flag from porcelain v2 (`.`, `M`, `A`, …). */
  staged: string;
  /** Raw worktree status flag from porcelain v2 (`.`, `M`, `?`, …). */
  worktree: string;
  isStaged: boolean;
  isModified: boolean;
  isUntracked: boolean;
  isRenamed: boolean;
  /** Original path for a rename/copy (porcelain v2 `2 …` entries). */
  origPath?: string;
}

/** A working tree's overall git status. */
export interface GitStatus {
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: GitFileStatus[];
  /** False when the folder isn't inside a git repository. */
  inRepo: boolean;
}

/** One commit, as listed by {@link GitAPI.log}. */
export interface GitLogEntry {
  hash: string;
  shortHash: string;
  author: string;
  relativeDate: string;
  subject: string;
  /**
   * Number of files this commit touched — a merge commit's count is relative
   * to its **first parent** (same convention as {@link GitAPI.commitDetail}).
   * Comes free off the same `git log` call (via `--numstat`), no per-commit
   * follow-up request.
   */
  filesChanged: number;
}

/** One file changed by a commit, as listed by {@link GitAPI.commitDetail}. */
export interface CommitFileChange {
  path: string;
  /** Original path for a rename/copy (from `diff-tree -M`). */
  origPath?: string;
  status: "A" | "M" | "D" | "R" | "C" | "T" | "U" | "X";
  /** True when git reports no line counts for this path (a binary blob). */
  binary: boolean;
  /** `null` for a binary file — no line count to show. */
  additions: number | null;
  deletions: number | null;
}

/** A single commit's full message and changed files, as returned by {@link GitAPI.commitDetail}. */
export interface CommitDetail extends GitLogEntry {
  /** Commit message body (everything after the subject line); `""` when none. */
  body: string;
  /** Parent commit hashes — empty for a root commit, 2+ for a merge. */
  parents: string[];
  files: CommitFileChange[];
}

/** One branch, as listed by {@link GitAPI.branches}. */
export interface GitBranch {
  /** Short name — `main` for a local branch, `origin/feat/x` for a remote one. */
  name: string;
  /** True for the currently checked-out branch. */
  current: boolean;
  /** True for a remote-tracking branch (`refs/remotes/*`). */
  remote: boolean;
  /** Upstream this branch tracks, e.g. `origin/main`; `null` for none / remotes. */
  upstream: string | null;
}

/** One working tree, as listed by {@link GitAPI.worktrees}. */
export interface GitWorktree {
  /** Absolute path of the worktree root (forward slashes). */
  path: string;
  /** Checked-out commit hash; `null` for a bare or prunable entry. */
  head: string | null;
  /** Short branch name (`refs/heads/x` → `x`); `null` when detached or bare. */
  branch: string | null;
  /** True for the main worktree — always the first entry git lists. */
  isMain: boolean;
  /** True when `HEAD` is detached (no branch checked out). */
  detached: boolean;
  /** True for a bare repository entry (nothing checked out to browse). */
  bare: boolean;
  /** Lock reason (`""` when locked without one); `null` when unlocked. */
  locked: string | null;
  /** Prune reason (e.g. a deleted directory); `null` when healthy. */
  prunable: string | null;
}

/**
 * The typed API the `silo.git` provider publishes. All methods take the repo
 * working directory (`cwd`) as their first argument and run `git` off the UI
 * thread via `ctx.process.exec`. Mutating calls resolve to `void` (output is
 * not surfaced); read calls resolve to parsed data.
 */
export interface GitAPI {
  /** Parsed working-tree status (branch, ahead/behind, per-file changes). */
  status(cwd: string): Promise<GitStatus>;
  /**
   * Recent commits (most recent first), capped at `limit` (default 50). Pass
   * `base` (from {@link GitAPI.branchBase}) to scope the log to commits
   * reachable from `HEAD` but not from `base` — GitHub's PR "Commits" tab
   * semantics — instead of walking `HEAD`'s full ancestry (which eventually
   * surfaces the default branch's history shared before the fork point).
   */
  log(cwd: string, limit?: number, base?: string): Promise<GitLogEntry[]>;
  /**
   * Exact commit count for {@link GitAPI.log}'s range (`base..HEAD` when
   * `base` is given, else all of `HEAD`'s ancestry) — cheap way to show a
   * "Commits (N)" total (`git rev-list --count`) without paging through
   * every entry. Resolves to `0` on error (e.g. an empty repo).
   */
  commitCount(cwd: string, base?: string): Promise<number>;
  /** Unified diff text for `path` (or the whole tree); `staged` diffs the index. */
  diff(cwd: string, path?: string, staged?: boolean): Promise<string>;
  /** Stage the given paths (`git add`). */
  stage(cwd: string, paths: string[]): Promise<void>;
  /** Unstage the given paths (`git restore --staged`). */
  unstage(cwd: string, paths: string[]): Promise<void>;
  /** Commit the staged changes with `message`. */
  commit(cwd: string, message: string): Promise<void>;
  /**
   * Read a file at a git revision — `reference` like `HEAD:path` or `:path`
   * (index). Resolves to empty string if the path doesn't exist at that
   * revision (e.g. an untracked file's HEAD version).
   */
  show(cwd: string, reference: string): Promise<string>;
  /**
   * Discard working-tree + staged changes for **tracked** paths, restoring them
   * to `HEAD` (`git restore --source=HEAD --staged --worktree`). Errors on
   * untracked paths (git has nothing to restore) — delete those with
   * {@link GitAPI.clean}.
   */
  revertFile(cwd: string, paths: string[]): Promise<void>;
  /**
   * Delete untracked files from the working tree (`git clean -f`). This is how
   * a new (untracked) file is "discarded" — there's no committed version to
   * restore, so discarding removes it.
   */
  clean(cwd: string, paths: string[]): Promise<void>;
  /**
   * Push to a remote. With no options, pushes the current branch to its
   * configured upstream (`git push`). Pass `branch` to push a specific local
   * branch, `remote` to target a remote other than `origin`, and `setUpstream`
   * to create the tracking link on a first push (`git push --set-upstream`).
   */
  push(
    cwd: string,
    options?: { branch?: string; remote?: string; setUpstream?: boolean },
  ): Promise<void>;
  /** All local and remote-tracking branches (see {@link GitBranch}). */
  branches(cwd: string): Promise<GitBranch[]>;
  /**
   * Fetch from the default remote (`git fetch`). With `prune`, also drops local
   * remote-tracking refs (`refs/remotes/*`) for branches deleted on the remote
   * (`git fetch --prune`) — the way to reconcile a {@link GitAPI.branches} list
   * that still shows long-deleted remote branches.
   */
  fetch(cwd: string, prune?: boolean): Promise<void>;
  /**
   * Fast-forward the current branch from its upstream (`git pull --ff-only`):
   * fetches, then advances the branch **only if** it can be fast-forwarded.
   * Rejects (non-zero) when the branch has diverged — there's no in-panel
   * conflict resolution, so the caller surfaces the failure as a toast rather
   * than leaving a half-finished merge. Requires a tracking branch.
   */
  pull(cwd: string): Promise<void>;
  /** Switch to an existing branch (`git switch <name>`). */
  switchBranch(cwd: string, name: string): Promise<void>;
  /**
   * Create a branch and switch to it (`git switch -c <name> [startPoint]`).
   * `startPoint` defaults to the current `HEAD`; pass a remote-tracking branch
   * (e.g. `origin/feat/x`) to check it out as a new local tracking branch.
   */
  createBranch(cwd: string, name: string, startPoint?: string): Promise<void>;
  /**
   * Delete a local branch (`git branch -d`, or `-D` when `force`). Without
   * `force`, git refuses to delete a branch that isn't fully merged.
   */
  deleteBranch(cwd: string, name: string, force?: boolean): Promise<void>;
  /** Rename a local branch (`git branch -m <oldName> <newName>`). */
  renameBranch(cwd: string, oldName: string, newName: string): Promise<void>;
  /**
   * Commits on `branch` not yet merged into its delete target — its `upstream`
   * if set, otherwise `HEAD` — i.e. exactly the commits `git branch -d` would
   * refuse to discard (it would need `-D`). An **empty array means the branch is
   * safe to delete** with `-d`; a non-empty array is the work that a force-delete
   * would throw away (most recent first). If the `upstream` ref can't be resolved
   * (e.g. a pruned remote-tracking branch), falls back to comparing against
   * `HEAD` rather than reporting the branch as merged.
   */
  unmergedCommits(
    cwd: string,
    branch: string,
    upstream?: string | null,
  ): Promise<GitLogEntry[]>;
  /**
   * The commit to pass as {@link GitAPI.log}'s `base` so the log shows only
   * `branch`'s own commits — the merge-base between `branch` and the repo's
   * default branch (resolved from `origin/HEAD`, falling back through
   * `origin/main`, `origin/master`, `main`, `master`). Resolves to `null` when
   * `branch` **is** the default branch (nothing to scope against) or no
   * default branch can be resolved (e.g. no `origin` remote) — either way the
   * caller should fall back to an unscoped log.
   */
  branchBase(cwd: string, branch: string): Promise<string | null>;
  /**
   * Full detail for one commit — message body, parents, and its changed files
   * (each with a status letter, rename origin, and line stats). A merge
   * commit's files are relative to its **first parent** (`--first-parent`
   * convention, matching `git log --first-parent`/GitHub's merge view); a root
   * commit (no parents) is relative to the empty tree, i.e. every file shows
   * as added. Resolves to `null` if `hash` can't be resolved.
   */
  commitDetail(cwd: string, hash: string): Promise<CommitDetail | null>;
  /**
   * Whether `path` is a binary file in the given comparison — `"workingTree"`
   * (`HEAD` vs. the working file), `"staged"` (`HEAD` vs. the index), or
   * `"commit"` (`ref.parent` vs. `ref.commit`, required for that mode).
   * Backs the diff content provider's binary guard so a binary blob shows a
   * placeholder instead of raw bytes garbling the diff editor.
   */
  isBinaryDiff(
    cwd: string,
    path: string,
    mode: "workingTree" | "staged" | "commit",
    ref?: { commit: string; parent: string },
  ): Promise<boolean>;
  /**
   * All working trees of the repo containing `cwd` (`git worktree list
   * --porcelain`), main worktree first — git lists the whole family from any
   * of its worktrees. Resolves to an empty array outside a repo.
   */
  worktrees(cwd: string): Promise<GitWorktree[]>;
  /**
   * Create a worktree at `path` (`git worktree add`). Pass `branch` to check
   * out an existing branch, or `newBranch` to create one (from `startPoint`,
   * defaulting to `HEAD`) and check it out. Git refuses a branch that is
   * already checked out in another worktree.
   */
  addWorktree(
    cwd: string,
    path: string,
    options: { branch: string } | { newBranch: string; startPoint?: string },
  ): Promise<void>;
  /**
   * Remove a worktree's directory and its bookkeeping (`git worktree remove`).
   * The branch it had checked out is kept. Without `force`, git refuses to
   * remove a worktree with modified or untracked files.
   */
  removeWorktree(cwd: string, path: string, force?: boolean): Promise<void>;
  /**
   * Drop bookkeeping for worktrees whose directories no longer exist
   * (`git worktree prune`) — the entries {@link GitWorktree.prunable} flags.
   */
  pruneWorktrees(cwd: string): Promise<void>;
}

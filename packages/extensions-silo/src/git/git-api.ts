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

/**
 * The typed API the `silo.git` provider publishes. All methods take the repo
 * working directory (`cwd`) as their first argument and run `git` off the UI
 * thread via `ctx.process.exec`. Mutating calls resolve to `void` (output is
 * not surfaced); read calls resolve to parsed data.
 */
export interface GitAPI {
  /** Parsed working-tree status (branch, ahead/behind, per-file changes). */
  status(cwd: string): Promise<GitStatus>;
  /** Recent commits (most recent first), capped at `limit` (default 50). */
  log(cwd: string, limit?: number): Promise<GitLogEntry[]>;
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
}

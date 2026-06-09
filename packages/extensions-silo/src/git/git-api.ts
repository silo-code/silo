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
  /** Discard working-tree + staged changes for paths (`git restore`). */
  revertFile(cwd: string, paths: string[]): Promise<void>;
  /** Push the current branch (`git push`). */
  push(cwd: string): Promise<void>;
}

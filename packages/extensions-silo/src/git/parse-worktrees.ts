import type { GitWorktree } from "./git-api";

// Pure parser for `git worktree list --porcelain`. Kept a pure
// string→GitWorktree[] function (no exec) so it's unit-testable against
// captured fixtures, the same way parse-status.ts and parse-branches.ts are.

/**
 * Parse `git worktree list --porcelain` output into {@link GitWorktree}
 * entries. Stanzas are separated by blank lines and each starts with
 * `worktree <abs-path>`, followed by attribute lines: `HEAD <sha>`,
 * `branch refs/heads/<name>`, bare labels `bare` / `detached`, and
 * label-with-optional-value lines `locked [reason]` / `prunable [reason]`.
 * Git always lists the main worktree first.
 */
export function parseWorktrees(raw: string): GitWorktree[] {
  const worktrees: GitWorktree[] = [];
  let current: GitWorktree | null = null;
  for (const line of raw.split("\n")) {
    if (!line.trim()) {
      current = null;
      continue;
    }
    if (line.startsWith("worktree ")) {
      current = {
        // Forward slashes, matching the repo-wide path convention.
        path: line.slice("worktree ".length).replace(/\\/g, "/"),
        head: null,
        branch: null,
        isMain: worktrees.length === 0,
        detached: false,
        bare: false,
        locked: null,
        prunable: null,
      };
      worktrees.push(current);
      continue;
    }
    if (!current) continue;
    if (line.startsWith("HEAD ")) {
      current.head = line.slice("HEAD ".length);
    } else if (line.startsWith("branch ")) {
      const ref = line.slice("branch ".length);
      current.branch = ref.startsWith("refs/heads/")
        ? ref.slice("refs/heads/".length)
        : ref;
    } else if (line === "bare") {
      current.bare = true;
    } else if (line === "detached") {
      current.detached = true;
    } else if (line === "locked" || line.startsWith("locked ")) {
      current.locked = line.slice("locked".length).trim();
    } else if (line === "prunable" || line.startsWith("prunable ")) {
      current.prunable = line.slice("prunable".length).trim();
    }
  }
  return worktrees;
}

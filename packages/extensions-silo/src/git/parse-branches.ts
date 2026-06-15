import type { GitBranch } from "./git-api";

// Pure parser for `git for-each-ref --format=%(refname)%09%(HEAD)%09%(upstream:short)
// refs/heads refs/remotes`. Kept a pure string→GitBranch[] function (no exec) so
// it's unit-testable against captured fixtures, the same way parse-status.ts is.

const TAB = "\t";

/**
 * Parse the tab-delimited `for-each-ref` lines into {@link GitBranch} entries.
 * Each line is `<refname>\t<HEAD marker>\t<upstream short>`, where the HEAD
 * marker is `*` for the current branch. `refs/remotes/<remote>/HEAD` (the
 * symbolic default-branch pointer, not a real branch) is skipped.
 */
export function parseBranches(raw: string): GitBranch[] {
  const branches: GitBranch[] = [];
  for (const line of raw.split("\n")) {
    if (!line) continue;
    const [refname = "", head = "", upstream = ""] = line.split(TAB);

    if (refname.startsWith("refs/heads/")) {
      branches.push({
        name: refname.slice("refs/heads/".length),
        current: head === "*",
        remote: false,
        upstream: upstream || null,
      });
    } else if (refname.startsWith("refs/remotes/")) {
      const name = refname.slice("refs/remotes/".length);
      // Skip the symbolic `<remote>/HEAD` pointer — it aliases another branch.
      if (name.endsWith("/HEAD")) continue;
      branches.push({ name, current: false, remote: true, upstream: null });
    }
  }
  return branches;
}

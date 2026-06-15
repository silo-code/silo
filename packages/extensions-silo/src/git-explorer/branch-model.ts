import type { GitBranch } from "../git/git-api";

// Pure presentation logic for the branch manager modal — filtering, ordering,
// and remote→local name derivation. Extracted from BranchManager.tsx so the
// rules are unit-testable without rendering React (per the repo's testing
// convention; see view-switcher-model.ts).

/** Case-insensitive substring filter over branch names. Blank query → all. */
export function filterBranches(
  branches: GitBranch[],
  query: string,
): GitBranch[] {
  const q = query.trim().toLowerCase();
  if (!q) return branches;
  return branches.filter((b) => b.name.toLowerCase().includes(q));
}

/**
 * Order for display: the current branch first, then the remaining local
 * branches, then remote-tracking branches — each group alphabetical. Stable and
 * non-mutating (returns a new array).
 */
export function orderBranches(branches: GitBranch[]): GitBranch[] {
  const rank = (b: GitBranch) => (b.current ? 0 : b.remote ? 2 : 1);
  return [...branches].sort(
    (a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name),
  );
}

/**
 * The local branch name to create when checking out a remote-tracking branch —
 * strips the leading `<remote>/` segment (`origin/feat/x` → `feat/x`). Names
 * without a `/` are returned unchanged.
 */
export function localNameFor(remoteBranchName: string): string {
  const slash = remoteBranchName.indexOf("/");
  return slash === -1 ? remoteBranchName : remoteBranchName.slice(slash + 1);
}

/** The set of remote-tracking branch names in a list (e.g. `"origin/main"`). */
export function remoteBranchNames(branches: GitBranch[]): Set<string> {
  return new Set(branches.filter((b) => b.remote).map((b) => b.name));
}

/**
 * Whether a local branch is **published** — its configured upstream actually
 * exists as a remote-tracking ref. A configured-but-missing upstream (the remote
 * branch was deleted/pruned, or never really pushed) counts as unpublished, so
 * the UI offers "publish" (cloud-up) rather than a plain push. `remoteNames`
 * comes from {@link remoteBranchNames} over the same branch list.
 */
export function isPublished(
  branch: GitBranch,
  remoteNames: Set<string>,
): boolean {
  return branch.upstream != null && remoteNames.has(branch.upstream);
}

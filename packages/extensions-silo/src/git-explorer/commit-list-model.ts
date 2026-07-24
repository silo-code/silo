import type { GitLogEntry } from "../git/git-api";

/** Which loaded commits haven't been pushed — see {@link dividerIndex}. */
export type UnpushedSet = Set<string> | "all" | null;

/**
 * Index of the first *pushed* commit in `commits` — where the "N commits ·
 * not pushed" divider goes (unpushed commits are always a contiguous run at
 * the top of the log). Returns `-1` when there's nothing to mark: `unpushed`
 * isn't a hash set (it's `"all"` or `null`), none of the loaded commits are
 * unpushed, or the boundary lies past the currently loaded page (every
 * loaded commit is unpushed — `findIndex` finds no pushed one yet).
 */
export function dividerIndex(
  commits: GitLogEntry[],
  unpushed: UnpushedSet,
): number {
  if (!(unpushed instanceof Set)) return -1;
  const idx = commits.findIndex((c) => !unpushed.has(c.hash));
  return idx > 0 ? idx : -1;
}

/** Display order for the commit list — `"newestFirst"` is git's native log
 * order; `"oldestFirst"` matches GitHub's PR "Commits" tab. */
export type CommitOrder = "newestFirst" | "oldestFirst";

/** `commits` (always fetched newest-first) rendered in `order`. */
export function orderedCommits(
  commits: GitLogEntry[],
  order: CommitOrder,
): GitLogEntry[] {
  return order === "oldestFirst" ? [...commits].reverse() : commits;
}

/**
 * Maps a divider position from {@link dividerIndex}'s canonical (newest-first)
 * indexing to its position in `order`'s display list. Reversing the list
 * mirrors the boundary: the unpushed run (indices `[0, canonicalIndex)` in
 * canonical order) becomes the *last* `canonicalIndex` entries once reversed.
 */
export function displayDividerIndex(
  canonicalIndex: number,
  total: number,
  order: CommitOrder,
): number {
  if (canonicalIndex === -1) return -1;
  return order === "oldestFirst" ? total - canonicalIndex : canonicalIndex;
}

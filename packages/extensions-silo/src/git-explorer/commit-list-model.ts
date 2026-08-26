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

/**
 * Formats a commit's {@link GitLogEntry.authorDate} (ISO 8601) into a
 * locale-formatted absolute date/time — the tooltip counterpart to
 * {@link GitLogEntry.relativeDate}, which is only accurate as of when it was
 * fetched and reads increasingly wrong sitting in a list between refreshes.
 * Returns the raw string unchanged if it doesn't parse as a date (e.g. a
 * hand-built `GitAPI` test stub that leaves it empty).
 */
export function formatAuthorDate(authorDate: string): string {
  const date = new Date(authorDate);
  if (Number.isNaN(date.getTime())) return authorDate;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

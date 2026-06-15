import type { GitFileStatus } from "../git/git-api";

/** Which section an item belongs to. */
export type GitSection = "staged" | "changes";

/**
 * One keyboard-navigable element in the Git panel's file area — either a
 * collapsible section header or a file row. The flat list of these is the index
 * space {@link useFocusGroup} roves over, so it must be built in the exact order
 * `GitView` renders (see {@link buildGitNavItems}).
 */
export type GitNavItem =
  | { kind: "header"; section: GitSection }
  | { kind: "row"; section: GitSection; file: GitFileStatus };

/**
 * The flat list of navigable items in render order: the "Staged Changes" header
 * (only when there are staged files) and, when that section is open, its rows;
 * then the always-present "Changes" header and, when open, its rows. A collapsed
 * section contributes only its header (its rows aren't rendered, so they aren't
 * navigable). Kept in lockstep with `GitView`'s JSX so arrow movement lands on
 * the adjacent on-screen element.
 */
export function buildGitNavItems(opts: {
  stagedFiles: GitFileStatus[];
  changedFiles: GitFileStatus[];
  stagedOpen: boolean;
  changesOpen: boolean;
}): GitNavItem[] {
  const { stagedFiles, changedFiles, stagedOpen, changesOpen } = opts;
  const items: GitNavItem[] = [];
  if (stagedFiles.length > 0) {
    items.push({ kind: "header", section: "staged" });
    if (stagedOpen) {
      for (const file of stagedFiles)
        items.push({ kind: "row", section: "staged", file });
    }
  }
  items.push({ kind: "header", section: "changes" });
  if (changesOpen) {
    for (const file of changedFiles)
      items.push({ kind: "row", section: "changes", file });
  }
  return items;
}

/**
 * A stable lookup key for a nav item, so the renderer can map a header or a file
 * row back to its focus-group index (mirrors the Tree's `indexOfPath` map):
 * `h:<section>` for a header, `r:<section>:<path>` for a row.
 */
export function navItemKey(it: GitNavItem): string {
  return it.kind === "header"
    ? `h:${it.section}`
    : `r:${it.section}:${it.file.path}`;
}

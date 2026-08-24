import type { GitFileStatus } from "../git/git-api";
import type { GitNavItem } from "./git-nav";

/** Which virtualized file list a keyboard-nav row index maps to. */
export type VirtualRowScrollTarget = {
  section: "staged" | "changes";
  /** Index within that section's `files` array (not the flat nav index). */
  rowIndex: number;
};

/**
 * Map a flat {@link buildGitNavItems} index to the staged/changes virtual list
 * row the focus group is about to land on. Headers and collapsed-section rows
 * return `null` — only open-section file rows need scrolling.
 */
export function resolveRowScrollTarget(
  navItems: GitNavItem[],
  navIndex: number,
  stagedFiles: GitFileStatus[],
  changedFiles: GitFileStatus[],
): VirtualRowScrollTarget | null {
  const item = navItems[navIndex];
  if (!item || item.kind !== "row") return null;
  const files = item.section === "staged" ? stagedFiles : changedFiles;
  const rowIndex = files.findIndex((f) => f.path === item.file.path);
  if (rowIndex < 0) return null;
  return { section: item.section, rowIndex };
}

/** Offset from a scroll container's content top to a virtual list root element. */
export function measureScrollMargin(
  scrollEl: HTMLElement,
  listEl: HTMLElement,
): number {
  const scrollTop = scrollEl.scrollTop;
  const scrollRect = scrollEl.getBoundingClientRect();
  const listRect = listEl.getBoundingClientRect();
  return listRect.top - scrollRect.top + scrollTop;
}

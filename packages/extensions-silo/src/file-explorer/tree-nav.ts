// Pure tree-navigation logic, factored out of the Tree component so the rules are
// unit-testable (mirrors markdown-preview/match.ts + menu.ts). The component is
// thin glue: it owns React state and DOM focus (via useFocusGroup) and calls
// these to decide *what* a key or a flatten should do.

import { dirOf, type Listing } from "./tree-types";

/** A visible row in the tree, in document (render) order. */
export interface FlatNode {
  path: string;
  isDir: boolean;
}

/**
 * The currently-visible rows under `root`, in the exact order the tree renders
 * them — each expanded directory contributes its listing's entries (in listing
 * order, dirs/files interleaved exactly as `TreeNodes` maps them), then recurses
 * into expanded sub-dirs. The root row itself is excluded (it isn't a focus
 * item). This is the index space `useFocusGroup` navigates, so it MUST match the
 * DOM order for arrow movement to land on the visually-adjacent row.
 */
export function flattenVisible(
  root: string,
  listings: Record<string, Listing>,
  expanded: Record<string, boolean>,
): FlatNode[] {
  const result: FlatNode[] = [];
  function walk(dirPath: string): void {
    if (!expanded[dirPath]) return;
    const listing = listings[dirPath];
    if (!listing || listing.error) return;
    for (const e of listing.entries) {
      result.push({ path: e.path, isDir: e.isDir });
      if (e.isDir) walk(e.path);
    }
  }
  walk(root);
  return result;
}

/**
 * What ←/→ should do on a tree row — the tree-specific arrow semantics that
 * `useFocusGroup` (a flat vertical list) doesn't model. ↑/↓/Home/End stay with
 * the group; this owns only the horizontal axis:
 *
 * - **→** on a collapsed directory expands it; otherwise nothing.
 * - **←** on an expanded directory collapses it; otherwise it focuses the parent
 *   row (unless the parent is the hidden root).
 *
 * Returns `null` when the key is a no-op so the caller can leave default
 * behavior alone.
 */
export type TreeArrowAction =
  | { kind: "expand"; path: string }
  | { kind: "collapse"; path: string }
  | { kind: "focusParent"; path: string };

export function treeArrowNav(opts: {
  key: "ArrowLeft" | "ArrowRight";
  path: string;
  isDir: boolean;
  expanded: Record<string, boolean>;
  root: string;
}): TreeArrowAction | null {
  const { key, path, isDir, expanded, root } = opts;
  if (key === "ArrowRight") {
    return isDir && !expanded[path] ? { kind: "expand", path } : null;
  }
  // ArrowLeft
  if (isDir && expanded[path]) return { kind: "collapse", path };
  const parent = dirOf(path);
  if (parent && parent !== root) return { kind: "focusParent", path: parent };
  return null;
}

/**
 * The expanded-map update for "Collapse All": `root` stays expanded, every
 * other path this tree has ever expanded is explicitly set to `false`.
 *
 * Explicit `false` (not just omitting the key) matters because the caller
 * persists this map by merging it onto shared storage — a merge can only
 * add/overwrite keys, never clear ones absent from the update. Returning
 * `{ [root]: true }` alone would leave every previously-expanded
 * subdirectory stuck at `true` in storage, so the next remount (workspace
 * switch, hot reload) would reopen them even though this collapse looked
 * like it took effect locally.
 */
export function collapseAllExpanded(
  expanded: Record<string, boolean>,
  root: string,
): Record<string, boolean> {
  const next: Record<string, boolean> = { [root]: true };
  for (const path of Object.keys(expanded)) {
    if (path !== root) next[path] = false;
  }
  return next;
}

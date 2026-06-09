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

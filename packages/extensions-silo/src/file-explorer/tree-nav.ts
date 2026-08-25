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

/** A row action the tree binds to a keyboard chord. */
export type RowShortcut =
  | "open"
  | "rename"
  | "delete"
  | "reveal"
  | "cut"
  | "copy"
  | "copyPath"
  | "copyRelPath";

/** The parts of a keydown the row chords look at. */
export interface RowKeyChord {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * True when the chord carries the platform's **primary** modifier — Cmd on
 * macOS, Ctrl everywhere else. These row shortcuts are hand-rolled rather than
 * registered through `ctx.registerKeybinding`, so they never inherit the host
 * dispatcher's platform mapping and have to make the same choice themselves.
 * Testing `metaKey` directly left every one of them demanding the physical
 * Windows key off-Mac.
 */
function hasPrimaryMod(e: RowKeyChord, isMac: boolean): boolean {
  return isMac ? e.metaKey : e.ctrlKey;
}

/**
 * The row action a chord invokes, or null when the tree doesn't own the key
 * (the caller then defers to the focus group's own movement handling).
 *
 * Order matters: plain Enter renames, so the Cmd/Ctrl+Enter "open" case has to
 * be tested first.
 */
export function matchRowShortcut(
  e: RowKeyChord,
  isMac: boolean,
): RowShortcut | null {
  const primary = hasPrimaryMod(e, isMac);
  if (e.key === "Enter") {
    if (primary) return "open";
    return e.shiftKey ? null : "rename";
  }
  if (e.key === "Backspace") return primary ? "delete" : null;
  if (!primary) return null;
  // Shift uppercases `key` ("C" for Ctrl+Alt+Shift+C), so fold the case — the
  // chord is about which letter, not how the OS reported it.
  const letter = e.key.toLowerCase();
  if (letter === "r") return e.altKey ? "reveal" : null;
  if (letter === "x") return e.altKey || e.shiftKey ? null : "cut";
  if (letter !== "c") return null;
  if (!e.altKey) return e.shiftKey ? null : "copy";
  return e.shiftKey ? "copyRelPath" : "copyPath";
}

/**
 * Context-menu accelerator labels for the row shortcuts. macOS uses its glyph
 * vocabulary; elsewhere the chords spell out in the modifier order `displayKey`
 * uses for the Keyboard Shortcuts page (Ctrl, Alt, Shift) — so a Windows user
 * sees "Ctrl+Backspace" next to Delete rather than "⌘⌫".
 */
export function rowAccelerators(isMac: boolean): Record<RowShortcut, string> {
  return isMac
    ? {
        open: "⌘↩",
        rename: "↵",
        delete: "⌘⌫",
        reveal: "⌥⌘R",
        cut: "⌘X",
        copy: "⌘C",
        copyPath: "⌥⌘C",
        copyRelPath: "⌥⇧⌘C",
      }
    : {
        open: "Ctrl+Enter",
        rename: "Enter",
        delete: "Ctrl+Backspace",
        reveal: "Ctrl+Alt+R",
        cut: "Ctrl+X",
        copy: "Ctrl+C",
        copyPath: "Ctrl+Alt+C",
        copyRelPath: "Ctrl+Alt+Shift+C",
      };
}

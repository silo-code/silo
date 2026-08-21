// The SideDock layout tree (RFC 0027) — the geometry half of a side dock.
//
// A dock is a tree: `split` nodes arrange their children in a row or a column,
// `pane` leaves are the things that render a tab bar. The tree says *where*
// panes sit and how big they are; it says nothing about which Side Panels are
// in them. Membership stays in `sidePanelLocations` (panel id → pane id), which
// is what lets the four legacy slot strings become the four initial pane ids and
// keeps every persisted map's shape unchanged.
//
// Everything here is pure and immutable: no node passed in is ever mutated, and
// every operation returns a fresh tree. That matters because these trees live in
// the valtio store, where an in-place edit would be an untracked mutation.
//
// Two invariants hold for every tree these functions return, and `normalize`
// establishes them for one arriving from disk:
//
//   1. No split has fewer than two children (a one-child split *is* its child).
//   2. No split has a child split of the same direction — same-direction nesting
//      is flattened, so three stacked panes are one 3-child node rather than a
//      right-leaning chain. This is what makes the middle resize handle move two
//      neighbors instead of a subtree.

/** A leaf: one tab bar over an ordered set of Side Panels. */
export interface SideDockPane {
  type: "pane";
  /**
   * Opaque, stable, and unique across *both* docks — which is what lets a
   * cross-dock drag stay a single `sidePanelLocations` write with no notion of
   * a "source" dock. The four legacy slot strings ("left", "left-bottom",
   * "right", "right-bottom") are ordinary ids and are exactly what
   * {@link treesFromLegacySlots} produces.
   */
  id: string;
}

export interface SideDockSplit {
  type: "split";
  /** "row" = panes side by side, "column" = panes stacked. */
  direction: SplitDirection;
  children: SideDockNode[];
  /** Percentages of the parent — `children.length` long, summing to 100. */
  sizes: number[];
}

export type SplitDirection = "row" | "column";
export type SideDockNode = SideDockSplit | SideDockPane;

/** One tree per dock. */
export interface SideDockTrees {
  left: SideDockNode;
  right: SideDockNode;
}

/** Where a new pane goes relative to an existing one. */
export type InsertSide = "left" | "right" | "top" | "bottom";

/** The sizes the one hardcoded vertical split used before the tree existed —
 * kept so migrating an existing workspace doesn't visibly re-proportion it. */
export const LEGACY_SPLIT_SIZES: readonly number[] = [55, 45];

const SIZE_EPSILON = 0.01;

export function pane(id: string): SideDockPane {
  return { type: "pane", id };
}

export function split(
  direction: SplitDirection,
  children: SideDockNode[],
  sizes?: number[],
): SideDockSplit {
  return {
    type: "split",
    direction,
    children,
    sizes: sizes ? [...sizes] : evenSizes(children.length),
  };
}

export function isPane(node: SideDockNode): node is SideDockPane {
  return node.type === "pane";
}

function evenSizes(count: number): number[] {
  return count > 0 ? Array.from({ length: count }, () => 100 / count) : [];
}

/** Scale `sizes` so they sum to 100, falling back to an even spread when they
 * carry no usable information (all zero, negative, or non-finite). */
function rescale(sizes: number[]): number[] {
  const usable = sizes.map((n) => (Number.isFinite(n) && n > 0 ? n : 0));
  const total = usable.reduce((a, b) => a + b, 0);
  if (total <= 0) return evenSizes(sizes.length);
  // Already valid: hand back the values untouched. Dividing and re-multiplying
  // by 100 is not lossless in binary floating point (55 comes back as
  // 55.00000000000001), and `normalize` runs on every hydrate — without this
  // guard a size would drift a little further from the user's drag each launch.
  if (
    Math.abs(total - 100) <= SIZE_EPSILON &&
    usable.every((n, i) => n === sizes[i])
  )
    return [...sizes];
  return usable.map((n) => (n / total) * 100);
}

/** The direction a new pane on this side needs its parent to have. */
export function directionFor(side: InsertSide): SplitDirection {
  return side === "left" || side === "right" ? "row" : "column";
}

function insertsBefore(side: InsertSide): boolean {
  return side === "left" || side === "top";
}

// ─── queries ────────────────────────────────────────────────────────────────

/** Every pane id in the tree, in render order. */
export function paneIds(node: SideDockNode): string[] {
  if (isPane(node)) return [node.id];
  return node.children.flatMap(paneIds);
}

/** The first pane in render order — a dock's fallback target, and what an
 * unresolvable pane id lands in. */
export function firstPaneId(node: SideDockNode): string {
  return paneIds(node)[0];
}

export function hasPane(node: SideDockNode, id: string): boolean {
  return isPane(node)
    ? node.id === id
    : node.children.some((c) => hasPane(c, id));
}

/** Which dock holds `paneId`, or null when neither does. */
export function dockOfPane(
  trees: SideDockTrees,
  paneId: string,
): "left" | "right" | null {
  if (hasPane(trees.left, paneId)) return "left";
  if (hasPane(trees.right, paneId)) return "right";
  return null;
}

// ─── normalize ──────────────────────────────────────────────────────────────

/**
 * Repair a tree read from disk into one that satisfies both invariants, without
 * ever discarding a pane.
 *
 * A `sizes` array of the wrong length, or one that doesn't sum to 100, is
 * rescaled (or spread evenly when it carries nothing usable) rather than
 * rejected: a hand-edited or half-written file should cost the user their
 * proportions, never their panes.
 */
export function normalize(
  node: SideDockNode,
  fallbackPaneId: string,
): SideDockNode {
  return normalizeNode(node) ?? pane(fallbackPaneId);
}

/** Both docks at once — the shape hydration actually deals in. */
export function normalizeTrees(trees: SideDockTrees): SideDockTrees {
  return {
    left: normalize(trees.left, "left"),
    right: normalize(trees.right, "right"),
  };
}

/** `null` when the subtree holds no pane at all — only reachable from a
 * malformed file, since nothing here ever produces a childless split. */
function normalizeNode(node: SideDockNode): SideDockNode | null {
  if (isPane(node)) return node;

  // Normalize children first, then flatten any same-direction child into this
  // node — scaling the grandchildren by the slot their parent occupied, so the
  // flattened layout looks identical to the nested one.
  const children: SideDockNode[] = [];
  const sizes: number[] = [];
  const parentSizes = rescale(
    node.sizes.length === node.children.length
      ? node.sizes
      : evenSizes(node.children.length),
  );

  node.children.forEach((child, i) => {
    const normalized = normalizeNode(child);
    if (normalized === null) return;
    const slot = parentSizes[i];
    if (!isPane(normalized) && normalized.direction === node.direction) {
      const inner = rescale(normalized.sizes);
      normalized.children.forEach((grandchild, j) => {
        children.push(grandchild);
        sizes.push((inner[j] / 100) * slot);
      });
      return;
    }
    children.push(normalized);
    sizes.push(slot);
  });

  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return {
    type: "split",
    direction: node.direction,
    children,
    sizes: rescale(sizes),
  };
}

/** True when the tree already satisfies both invariants and its sizes sum to
 * 100 — the cheap check that lets a hydrate skip rewriting the store. */
export function isNormalized(node: SideDockNode): boolean {
  if (isPane(node)) return true;
  if (node.children.length < 2) return false;
  if (node.sizes.length !== node.children.length) return false;
  const total = node.sizes.reduce((a, b) => a + b, 0);
  if (Math.abs(total - 100) > SIZE_EPSILON) return false;
  return node.children.every(
    (c) => (isPane(c) || c.direction !== node.direction) && isNormalized(c),
  );
}

/**
 * Keep only the panes `keep` accepts, collapsing what that empties exactly as
 * {@link removePane} does. `null` when nothing survives.
 *
 * This is how a dock renders: the stored tree is the user's arrangement, and
 * what's on screen is that tree minus the panes with nothing visible in them.
 * Filtering at render rather than pruning the stored tree is deliberate —
 * hiding a panel from the visibility menu makes its segment disappear and
 * un-hiding brings it back at the same size, which is the behavior the fixed
 * Top/Bottom slots had for free.
 */
export function retainPanes(
  node: SideDockNode,
  keep: (paneId: string) => boolean,
): SideDockNode | null {
  if (isPane(node)) return keep(node.id) ? node : null;

  const children: SideDockNode[] = [];
  const sizes: number[] = [];
  node.children.forEach((child, i) => {
    const kept = retainPanes(child, keep);
    if (kept === null) return;
    children.push(kept);
    sizes.push(node.sizes[i] ?? 0);
  });

  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  return normalizeNode({
    type: "split",
    direction: node.direction,
    children,
    sizes: rescale(sizes),
  });
}

// ─── cloning ────────────────────────────────────────────────────────────────

/** A structural copy — the store's trees must never alias a workspace record's
 * (or vice versa), the same rule every other panel-state container follows. */
export function cloneNode(node: SideDockNode): SideDockNode {
  return isPane(node)
    ? { type: "pane", id: node.id }
    : {
        type: "split",
        direction: node.direction,
        children: node.children.map(cloneNode),
        sizes: [...node.sizes],
      };
}

export function cloneTrees(trees: SideDockTrees): SideDockTrees {
  return { left: cloneNode(trees.left), right: cloneNode(trees.right) };
}

// ─── mutation ───────────────────────────────────────────────────────────────

/**
 * Add `newPaneId` next to `targetPaneId`, on the given side.
 *
 * When the target's parent already runs in the needed direction the new pane
 * joins it as a sibling, taking half the target's space — so a third pane
 * dropped below two stacked ones widens the existing column node instead of
 * nesting a new one. Otherwise the target leaf is replaced by a two-child split
 * at 50/50.
 *
 * Returns the tree unchanged when `targetPaneId` isn't in it.
 */
export function insertPane(
  node: SideDockNode,
  targetPaneId: string,
  newPaneId: string,
  side: InsertSide,
): SideDockNode {
  if (!hasPane(node, targetPaneId)) return node;
  const direction = directionFor(side);
  const before = insertsBefore(side);

  // Root is the target leaf: nothing above it to join, so wrap it.
  if (isPane(node)) {
    const pair = before ? [pane(newPaneId), node] : [node, pane(newPaneId)];
    return split(direction, pair, [50, 50]);
  }

  const idx = node.children.findIndex(
    (c) => isPane(c) && c.id === targetPaneId,
  );

  if (idx !== -1 && node.direction === direction) {
    // The target is our own child and we already run the right way: splice the
    // new pane in beside it and halve the target's slot.
    const children = [...node.children];
    const sizes = [...node.sizes];
    const half = sizes[idx] / 2;
    sizes[idx] = half;
    children.splice(before ? idx : idx + 1, 0, pane(newPaneId));
    sizes.splice(before ? idx : idx + 1, 0, half);
    return { type: "split", direction, children, sizes: rescale(sizes) };
  }

  if (idx !== -1) {
    // Target is our child but we run the other way: replace the leaf in place.
    const children = [...node.children];
    children[idx] = split(
      direction,
      before
        ? [pane(newPaneId), node.children[idx]]
        : [node.children[idx], pane(newPaneId)],
      [50, 50],
    );
    return { ...node, children, sizes: [...node.sizes] };
  }

  return {
    ...node,
    children: node.children.map((c) =>
      insertPane(c, targetPaneId, newPaneId, side),
    ),
    sizes: [...node.sizes],
  };
}

/**
 * Drop a pane, giving its space to its siblings in proportion.
 *
 * Returns `null` when the tree was that pane alone — the caller decides what an
 * emptied dock becomes (today: a fresh root pane, which renders as the empty
 * column). A split left holding one child collapses into it, which is how
 * closing the last panel in a segment gives the whole dock back.
 */
export function removePane(
  node: SideDockNode,
  id: string,
): SideDockNode | null {
  if (isPane(node)) return node.id === id ? null : node;
  if (!hasPane(node, id)) return node;

  const children: SideDockNode[] = [];
  const sizes: number[] = [];
  node.children.forEach((child, i) => {
    const kept = removePane(child, id);
    if (kept === null) return;
    children.push(kept);
    sizes.push(node.sizes[i] ?? 0);
  });

  if (children.length === 0) return null;
  if (children.length === 1) return children[0];
  // Re-normalize: collapsing a child split can expose same-direction nesting
  // that wasn't there before the removal.
  return normalizeNode({
    type: "split",
    direction: node.direction,
    children,
    sizes: rescale(sizes),
  });
}

/**
 * Move `paneId` to sit beside `targetPaneId` — remove, then insert. Used by a
 * drag that lands on a pane edge, where the panel's old pane may be left empty
 * and collapse in the process.
 *
 * A no-op when the two ids are the same, or when either isn't in the tree.
 */
export function movePane(
  node: SideDockNode,
  paneId: string,
  targetPaneId: string,
  side: InsertSide,
): SideDockNode {
  if (paneId === targetPaneId) return node;
  if (!hasPane(node, paneId) || !hasPane(node, targetPaneId)) return node;
  const without = removePane(node, paneId);
  if (without === null || !hasPane(without, targetPaneId)) return node;
  return insertPane(without, targetPaneId, paneId, side);
}

/** Replace the sizes of the split that owns `paneIdInSplit`'s level — the write
 * a resize-handle drag makes. Sizes are rescaled to sum to 100. */
export function setSizes(
  node: SideDockNode,
  splitPath: readonly number[],
  sizes: number[],
): SideDockNode {
  if (isPane(node)) return node;
  if (splitPath.length === 0) {
    if (sizes.length !== node.children.length) return node;
    return { ...node, sizes: rescale(sizes) };
  }
  const [head, ...rest] = splitPath;
  const child = node.children[head];
  if (child === undefined) return node;
  const children = [...node.children];
  children[head] = setSizes(child, rest, sizes);
  return { ...node, children, sizes: [...node.sizes] };
}

// ─── migration ──────────────────────────────────────────────────────────────

/** A dock with nothing but its legacy top pane. */
export function defaultTrees(): SideDockTrees {
  return { left: pane("left"), right: pane("right") };
}

/**
 * Derive the trees a pre-RFC-0027 workspace implies from its
 * `sidePanelLocations` map.
 *
 * The whole migration is this: a dock gets a second, stacked pane exactly when
 * some panel names its `-bottom` slot, and the panes are *named* with the legacy
 * slot strings. Because the ids are the old values verbatim,
 * `sidePanelLocations`, `sidePanelOrder`, and `activeSidePanelTabs` need no key
 * rewriting at all — the active tab in `right-bottom` is still the active tab of
 * the pane now called `right-bottom`.
 *
 * Takes only the map's values, so it needs neither the registry nor the store.
 */
export function treesFromLegacySlots(
  locations: Readonly<Record<string, string>>,
): SideDockTrees {
  const used = new Set(Object.values(locations));
  const dock = (side: "left" | "right"): SideDockNode =>
    used.has(`${side}-bottom`)
      ? split(
          "column",
          [pane(side), pane(`${side}-bottom`)],
          [...LEGACY_SPLIT_SIZES],
        )
      : pane(side);
  return { left: dock("left"), right: dock("right") };
}

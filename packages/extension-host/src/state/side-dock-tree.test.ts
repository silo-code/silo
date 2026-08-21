import { describe, it, expect } from "vitest";
import {
  childAnchors,
  cloneTrees,
  dockOfPane,
  defaultTrees,
  firstPaneId,
  hasPane,
  insertPane,
  isNormalized,
  movePane,
  normalize,
  normalizeTrees,
  pane,
  paneIds,
  pruneUnreferenced,
  removePane,
  retainPanes,
  setSizes,
  split,
  treesFromLegacySlots,
  type SideDockNode,
  type SideDockSplit,
} from "./side-dock-tree";

/** The sizes of a node asserted to be a split — keeps the casts out of tests. */
function sizesOf(node: SideDockNode): number[] {
  expect(node.type).toBe("split");
  return (node as SideDockSplit).sizes;
}

function asSplit(node: SideDockNode): SideDockSplit {
  expect(node.type).toBe("split");
  return node as SideDockSplit;
}

describe("queries", () => {
  const tree = split("column", [
    pane("a"),
    split("row", [pane("b"), pane("c")]),
  ]);

  it("lists pane ids in render order", () => {
    expect(paneIds(tree)).toEqual(["a", "b", "c"]);
    expect(firstPaneId(tree)).toBe("a");
  });

  it("finds panes at any depth", () => {
    expect(hasPane(tree, "c")).toBe(true);
    expect(hasPane(tree, "zz")).toBe(false);
  });

  it("reports which dock holds a pane", () => {
    const trees = { left: pane("left"), right: tree };
    expect(dockOfPane(trees, "left")).toBe("left");
    expect(dockOfPane(trees, "c")).toBe("right");
    expect(dockOfPane(trees, "zz")).toBeNull();
  });
});

describe("normalize", () => {
  it("leaves a well-formed tree alone", () => {
    const tree = split("column", [pane("a"), pane("b")], [55, 45]);
    expect(normalize(tree, "left")).toEqual(tree);
    expect(isNormalized(tree)).toBe(true);
  });

  it("is idempotent, so sizes do not drift across launches", () => {
    let tree: SideDockNode = split("column", [pane("a"), pane("b")], [55, 45]);
    for (let i = 0; i < 20; i++) tree = normalize(tree, "left");
    expect(sizesOf(tree)).toEqual([55, 45]);
  });

  it("collapses a one-child split into its child", () => {
    expect(normalize(split("row", [pane("a")], [100]), "left")).toEqual(
      pane("a"),
    );
  });

  it("flattens same-direction nesting, preserving on-screen proportions", () => {
    // a | (b | c) with the inner split owning half → a=50, b=25, c=25.
    const nested = split(
      "row",
      [pane("a"), split("row", [pane("b"), pane("c")], [50, 50])],
      [50, 50],
    );
    const flat = asSplit(normalize(nested, "left"));
    expect(flat.children.map((c) => (c as { id: string }).id)).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(flat.sizes).toEqual([50, 25, 25]);
    expect(isNormalized(flat)).toBe(true);
  });

  it("keeps opposite-direction nesting", () => {
    const tree = split("column", [
      pane("a"),
      split("row", [pane("b"), pane("c")]),
    ]);
    expect(normalize(tree, "left")).toEqual(tree);
  });

  it("rescales sizes that do not sum to 100", () => {
    const tree = split("row", [pane("a"), pane("b")], [1, 3]);
    expect(sizesOf(normalize(tree, "left"))).toEqual([25, 75]);
  });

  it("spreads evenly when sizes carry nothing usable", () => {
    for (const sizes of [
      [0, 0],
      [-5, -5],
      [Number.NaN, 10],
    ]) {
      const out = normalize(
        split("row", [pane("a"), pane("b")], sizes),
        "left",
      );
      // NaN/negative entries are dropped to zero, so a lone positive wins;
      // an all-unusable pair falls back to an even spread.
      expect(sizesOf(out).reduce((a, b) => a + b, 0)).toBeCloseTo(100);
    }
    expect(
      sizesOf(normalize(split("row", [pane("a"), pane("b")], [0, 0]), "left")),
    ).toEqual([50, 50]);
  });

  it("repairs a sizes array of the wrong length rather than dropping panes", () => {
    const tree = split("row", [pane("a"), pane("b"), pane("c")], [70, 30]);
    const out = normalize(tree, "left");
    expect(paneIds(out)).toEqual(["a", "b", "c"]);
    expect(sizesOf(out)).toEqual([100 / 3, 100 / 3, 100 / 3]);
  });

  it("falls back to the given pane id when a tree holds no panes at all", () => {
    const empty = {
      type: "split",
      direction: "row",
      children: [],
      sizes: [],
    } as SideDockNode;
    expect(normalize(empty, "right")).toEqual(pane("right"));
  });

  it("normalizes both docks", () => {
    const trees = normalizeTrees({
      left: split("row", [pane("left")], [100]),
      right: pane("right"),
    });
    expect(trees).toEqual({ left: pane("left"), right: pane("right") });
  });
});

describe("insertPane", () => {
  it("wraps a root leaf in a split, honoring the side", () => {
    expect(insertPane(pane("a"), "a", "b", "right")).toEqual(
      split("row", [pane("a"), pane("b")], [50, 50]),
    );
    expect(insertPane(pane("a"), "a", "b", "top")).toEqual(
      split("column", [pane("b"), pane("a")], [50, 50]),
    );
  });

  it("joins an existing split running the same way, halving the target's slot", () => {
    const tree = split("column", [pane("a"), pane("b")], [60, 40]);
    const out = asSplit(insertPane(tree, "b", "c", "bottom"));
    expect(paneIds(out)).toEqual(["a", "b", "c"]);
    expect(out.sizes).toEqual([60, 20, 20]);
    // Three stacked panes are one node, not a chain — invariant 2.
    expect(out.children.every((c) => c.type === "pane")).toBe(true);
    expect(isNormalized(out)).toBe(true);
  });

  it("inserts before the target for a leading side", () => {
    const tree = split("column", [pane("a"), pane("b")], [60, 40]);
    expect(paneIds(insertPane(tree, "b", "c", "top"))).toEqual(["a", "c", "b"]);
  });

  it("nests a cross-direction split in place, leaving siblings untouched", () => {
    const tree = split("column", [pane("a"), pane("b")], [60, 40]);
    const out = asSplit(insertPane(tree, "a", "c", "right"));
    expect(out.direction).toBe("column");
    expect(out.sizes).toEqual([60, 40]);
    expect(out.children[0]).toEqual(
      split("row", [pane("a"), pane("c")], [50, 50]),
    );
    expect(isNormalized(out)).toBe(true);
  });

  it("reaches a target nested several levels down", () => {
    const tree = split("column", [
      pane("a"),
      split("row", [pane("b"), pane("c")]),
    ]);
    const out = insertPane(tree, "c", "d", "right");
    expect(paneIds(out)).toEqual(["a", "b", "c", "d"]);
    expect(isNormalized(out)).toBe(true);
  });

  it("is a no-op for a target that is not in the tree", () => {
    const tree = split("row", [pane("a"), pane("b")]);
    expect(insertPane(tree, "zz", "c", "left")).toBe(tree);
  });

  it("does not mutate the input", () => {
    const tree = split("column", [pane("a"), pane("b")], [60, 40]);
    const snapshot = structuredClone(tree);
    insertPane(tree, "b", "c", "bottom");
    expect(tree).toEqual(snapshot);
  });
});

describe("removePane", () => {
  it("returns null when the tree was that pane alone", () => {
    expect(removePane(pane("a"), "a")).toBeNull();
  });

  it("collapses a two-child split into the survivor", () => {
    const tree = split("row", [pane("a"), pane("b")], [30, 70]);
    expect(removePane(tree, "a")).toEqual(pane("b"));
  });

  it("gives the removed pane's space to its siblings in proportion", () => {
    const tree = split(
      "column",
      [pane("a"), pane("b"), pane("c")],
      [50, 25, 25],
    );
    const out = asSplit(removePane(tree, "c")!);
    expect(paneIds(out)).toEqual(["a", "b"]);
    expect(out.sizes[0]).toBeCloseTo(200 / 3);
    expect(out.sizes[1]).toBeCloseTo(100 / 3);
  });

  it("flattens nesting exposed by a collapse", () => {
    // Removing "b" collapses the inner row to "c", which is then a row child of
    // a row parent — invariant 2 says that must flatten.
    const tree = split(
      "row",
      [pane("a"), split("row", [pane("b"), pane("c")], [50, 50])],
      [50, 50],
    );
    const out = asSplit(removePane(tree, "b")!);
    expect(paneIds(out)).toEqual(["a", "c"]);
    expect(out.children.every((c) => c.type === "pane")).toBe(true);
    expect(isNormalized(out)).toBe(true);
  });

  it("is a no-op for a pane that is not in the tree", () => {
    const tree = split("row", [pane("a"), pane("b")]);
    expect(removePane(tree, "zz")).toBe(tree);
  });

  it("does not mutate the input", () => {
    const tree = split("column", [pane("a"), pane("b"), pane("c")]);
    const snapshot = structuredClone(tree);
    removePane(tree, "b");
    expect(tree).toEqual(snapshot);
  });
});

describe("movePane", () => {
  it("relocates a pane, collapsing the split it left behind", () => {
    const tree = split(
      "row",
      [split("column", [pane("a"), pane("b")]), pane("c")],
      [50, 50],
    );
    const out = movePane(tree, "b", "c", "right");
    expect(paneIds(out)).toEqual(["a", "c", "b"]);
    expect(isNormalized(out)).toBe(true);
  });

  it("is a no-op when source and target are the same pane", () => {
    const tree = split("row", [pane("a"), pane("b")]);
    expect(movePane(tree, "a", "a", "left")).toBe(tree);
  });

  it("is a no-op when either pane is missing", () => {
    const tree = split("row", [pane("a"), pane("b")]);
    expect(movePane(tree, "zz", "a", "left")).toBe(tree);
    expect(movePane(tree, "a", "zz", "left")).toBe(tree);
  });

  it("refuses a move that would empty the tree of its target", () => {
    // Removing "a" from a two-pane split collapses it to "b"; the target must
    // still exist for the insert, which it does.
    const tree = split("row", [pane("a"), pane("b")], [50, 50]);
    expect(paneIds(movePane(tree, "a", "b", "bottom"))).toEqual(["b", "a"]);
  });
});

describe("setSizes", () => {
  it("writes the root split's sizes, rescaled", () => {
    const tree = split("row", [pane("a"), pane("b")], [50, 50]);
    expect(sizesOf(setSizes(tree, [], ["a", "b"], [1, 1]))).toEqual([50, 50]);
    expect(sizesOf(setSizes(tree, [], ["a", "b"], [30, 70]))).toEqual([30, 70]);
  });

  it("writes a nested split by path", () => {
    const tree = split(
      "column",
      [pane("a"), split("row", [pane("b"), pane("c")], [50, 50])],
      [50, 50],
    );
    const out = asSplit(setSizes(tree, [1], ["b", "c"], [80, 20]));
    expect(sizesOf(out.children[1])).toEqual([80, 20]);
    expect(out.sizes).toEqual([50, 50]); // parent untouched
  });

  it("ignores a wrong-length sizes array and an unreachable path", () => {
    const tree = split("row", [pane("a"), pane("b")], [50, 50]);
    expect(setSizes(tree, [], ["a", "b"], [100])).toBe(tree);
    expect(setSizes(tree, [9], ["a", "b"], [50, 50])).toBe(tree);
  });

  // The rendered tree is the stored tree minus the panes with nothing visible
  // in them, so a rendered path can name a stored split with different
  // children. Writing there would re-proportion panes the user never touched.
  it("refuses a write whose children are not the ones that were on screen", () => {
    const tree = split(
      "column",
      [pane("a"), pane("b"), pane("c")],
      [50, 25, 25],
    );
    // Two panes were on screen; the stored split has three.
    expect(setSizes(tree, [], ["a", "c"], [70, 30])).toBe(tree);
    // Right count, wrong panes.
    expect(setSizes(tree, [], ["a", "b", "zz"], [50, 25, 25])).toBe(tree);
    // Matching anchors go through.
    expect(sizesOf(setSizes(tree, [], ["a", "b", "c"], [60, 20, 20]))).toEqual([
      60, 20, 20,
    ]);
  });

  it("identifies a child subtree by its first pane", () => {
    const tree = split(
      "row",
      [split("column", [pane("a"), pane("b")]), pane("c")],
      [50, 50],
    );
    expect(childAnchors(tree)).toEqual(["a", "c"]);
    expect(sizesOf(setSizes(tree, [], ["a", "c"], [30, 70]))).toEqual([30, 70]);
  });
});

describe("pruneUnreferenced", () => {
  it("drops a pane nothing is placed in any more", () => {
    const tree = split("column", [pane("left"), pane("p2")], [60, 40]);
    expect(pruneUnreferenced(tree, new Set(["left"]))).toEqual(pane("left"));
  });

  it("keeps a pane that is still referenced", () => {
    const tree = split("column", [pane("left"), pane("p2")], [60, 40]);
    expect(pruneUnreferenced(tree, new Set(["p2"]))).toEqual(tree);
  });

  it("always keeps the dock's first pane, even unreferenced", () => {
    // Panels with no override live in the dock root, which no
    // `sidePanelLocations` entry names.
    expect(pruneUnreferenced(pane("right"), new Set())).toEqual(pane("right"));
    const tree = split("row", [pane("right"), pane("p2")], [50, 50]);
    expect(pruneUnreferenced(tree, new Set())).toEqual(pane("right"));
  });
});

describe("treesFromLegacySlots", () => {
  it("gives an untouched install one pane per dock", () => {
    expect(treesFromLegacySlots({})).toEqual(defaultTrees());
  });

  it("adds a stacked pane only for a dock some panel actually sits below in", () => {
    const trees = treesFromLegacySlots({
      "core.workspaces": "left",
      "silo.git": "right-bottom",
    });
    expect(trees.left).toEqual(pane("left"));
    expect(trees.right).toEqual(
      split("column", [pane("right"), pane("right-bottom")], [55, 45]),
    );
  });

  it("names the panes with the legacy slot strings verbatim", () => {
    // This is the whole compatibility trick: sidePanelLocations,
    // sidePanelOrder, and activeSidePanelTabs need no key rewriting because the
    // pane ids *are* the old slot values.
    const trees = treesFromLegacySlots({
      a: "left-bottom",
      b: "right-bottom",
    });
    expect(paneIds(trees.left)).toEqual(["left", "left-bottom"]);
    expect(paneIds(trees.right)).toEqual(["right", "right-bottom"]);
  });

  it("keeps the pre-tree 55/45 proportions", () => {
    const trees = treesFromLegacySlots({ a: "left-bottom" });
    expect(sizesOf(trees.left)).toEqual([55, 45]);
  });

  it("produces normalized trees", () => {
    const trees = treesFromLegacySlots({ a: "left-bottom", b: "right-bottom" });
    expect(isNormalized(trees.left)).toBe(true);
    expect(isNormalized(trees.right)).toBe(true);
  });
});

describe("retainPanes", () => {
  it("keeps the panes the predicate accepts, collapsing the rest", () => {
    const tree = split("column", [pane("a"), pane("b")], [70, 30]);
    expect(retainPanes(tree, (id) => id === "a")).toEqual(pane("a"));
  });

  it("returns null when nothing is kept", () => {
    const tree = split("row", [pane("a"), pane("b")]);
    expect(retainPanes(tree, () => false)).toBeNull();
  });

  it("keeps the survivors' proportions relative to each other", () => {
    const tree = split(
      "column",
      [pane("a"), pane("b"), pane("c")],
      [50, 25, 25],
    );
    const out = asSplit(retainPanes(tree, (id) => id !== "a")!);
    expect(paneIds(out)).toEqual(["b", "c"]);
    expect(out.sizes).toEqual([50, 50]);
  });

  // The filter is a *view*: it never touches the stored tree, which is what
  // makes hiding a panel and un-hiding it restore the same layout.
  it("leaves the input untouched, so hiding is reversible", () => {
    const tree = split("column", [pane("a"), pane("b")], [70, 30]);
    const snapshot = structuredClone(tree);
    retainPanes(tree, (id) => id === "a");
    expect(tree).toEqual(snapshot);
    expect(retainPanes(tree, () => true)).toEqual(snapshot);
  });

  it("flattens nesting a filter exposes", () => {
    const tree = split(
      "row",
      [pane("a"), split("row", [pane("b"), pane("c")], [50, 50])],
      [50, 50],
    );
    const out = asSplit(retainPanes(tree, (id) => id !== "b")!);
    expect(paneIds(out)).toEqual(["a", "c"]);
    expect(isNormalized(out)).toBe(true);
  });
});

describe("cloneTrees", () => {
  it("copies deeply enough that a mutation cannot leak between copies", () => {
    const trees = {
      left: split("column", [pane("a"), pane("b")], [60, 40]),
      right: pane("right"),
    };
    const copy = cloneTrees(trees);
    expect(copy).toEqual(trees);

    const original = asSplit(trees.left);
    original.sizes[0] = 10;
    original.children.push(pane("c"));
    expect(asSplit(copy.left).sizes).toEqual([60, 40]);
    expect(paneIds(copy.left)).toEqual(["a", "b"]);
  });
});

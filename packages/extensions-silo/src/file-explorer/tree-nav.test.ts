import { describe, it, expect } from "vitest";
import { flattenVisible, treeArrowNav } from "./tree-nav";
import type { Listing } from "./tree-types";

const root = "/ws";

// A small tree:
//   /ws
//     src/        (dir)
//       a.ts
//       util/     (dir)
//         b.ts
//     readme.md
const listings: Record<string, Listing> = {
  "/ws": {
    entries: [
      { name: "src", path: "/ws/src", isDir: true },
      { name: "readme.md", path: "/ws/readme.md", isDir: false },
    ] as Listing["entries"],
  },
  "/ws/src": {
    entries: [
      { name: "a.ts", path: "/ws/src/a.ts", isDir: false },
      { name: "util", path: "/ws/src/util", isDir: true },
    ] as Listing["entries"],
  },
  "/ws/src/util": {
    entries: [
      { name: "b.ts", path: "/ws/src/util/b.ts", isDir: false },
    ] as Listing["entries"],
  },
};

describe("flattenVisible", () => {
  it("returns nothing when the root is collapsed", () => {
    expect(flattenVisible(root, listings, {})).toEqual([]);
  });

  it("lists a collapsed root's direct children in listing order", () => {
    expect(flattenVisible(root, listings, { "/ws": true })).toEqual([
      { path: "/ws/src", isDir: true },
      { path: "/ws/readme.md", isDir: false },
    ]);
  });

  it("descends into expanded sub-dirs, preserving render order", () => {
    const flat = flattenVisible(root, listings, {
      "/ws": true,
      "/ws/src": true,
      "/ws/src/util": true,
    });
    expect(flat.map((n) => n.path)).toEqual([
      "/ws/src",
      "/ws/src/a.ts",
      "/ws/src/util",
      "/ws/src/util/b.ts",
      "/ws/readme.md",
    ]);
  });

  it("stops at a collapsed sub-dir (its children stay hidden)", () => {
    const flat = flattenVisible(root, listings, {
      "/ws": true,
      "/ws/src": true,
    });
    expect(flat.map((n) => n.path)).toEqual([
      "/ws/src",
      "/ws/src/a.ts",
      "/ws/src/util",
      "/ws/readme.md",
    ]);
  });

  it("skips directories that haven't loaded or errored", () => {
    const withError: Record<string, Listing> = {
      "/ws": {
        entries: [
          { name: "src", path: "/ws/src", isDir: true },
        ] as Listing["entries"],
      },
      "/ws/src": { entries: [], error: "denied" },
    };
    const flat = flattenVisible(root, withError, {
      "/ws": true,
      "/ws/src": true,
    });
    expect(flat.map((n) => n.path)).toEqual(["/ws/src"]);
  });
});

describe("treeArrowNav", () => {
  const expanded = { "/ws": true, "/ws/src": true };

  it("→ expands a collapsed directory", () => {
    expect(
      treeArrowNav({
        key: "ArrowRight",
        path: "/ws/src/util",
        isDir: true,
        expanded,
        root,
      }),
    ).toEqual({ kind: "expand", path: "/ws/src/util" });
  });

  it("→ is a no-op on an already-expanded directory", () => {
    expect(
      treeArrowNav({
        key: "ArrowRight",
        path: "/ws/src",
        isDir: true,
        expanded,
        root,
      }),
    ).toBeNull();
  });

  it("→ is a no-op on a file", () => {
    expect(
      treeArrowNav({
        key: "ArrowRight",
        path: "/ws/readme.md",
        isDir: false,
        expanded,
        root,
      }),
    ).toBeNull();
  });

  it("← collapses an expanded directory", () => {
    expect(
      treeArrowNav({
        key: "ArrowLeft",
        path: "/ws/src",
        isDir: true,
        expanded,
        root,
      }),
    ).toEqual({ kind: "collapse", path: "/ws/src" });
  });

  it("← on a file focuses its parent directory", () => {
    expect(
      treeArrowNav({
        key: "ArrowLeft",
        path: "/ws/src/a.ts",
        isDir: false,
        expanded,
        root,
      }),
    ).toEqual({ kind: "focusParent", path: "/ws/src" });
  });

  it("← on a collapsed directory focuses its parent", () => {
    expect(
      treeArrowNav({
        key: "ArrowLeft",
        path: "/ws/src/util",
        isDir: true,
        expanded: { "/ws": true, "/ws/src": true, "/ws/src/util": false },
        root,
      }),
    ).toEqual({ kind: "focusParent", path: "/ws/src" });
  });

  it("← does not escape to the hidden root", () => {
    expect(
      treeArrowNav({
        key: "ArrowLeft",
        path: "/ws/readme.md",
        isDir: false,
        expanded,
        root,
      }),
    ).toBeNull();
  });
});

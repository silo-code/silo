import { describe, it, expect } from "vitest";
import {
  collapseAllExpanded,
  flattenVisible,
  matchRowShortcut,
  rowAccelerators,
  treeArrowNav,
  type RowKeyChord,
} from "./tree-nav";
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

describe("collapseAllExpanded", () => {
  it("keeps the root expanded and explicitly collapses every other known path", () => {
    expect(
      collapseAllExpanded(
        { "/ws": true, "/ws/src": true, "/ws/src/util": false },
        root,
      ),
    ).toEqual({ "/ws": true, "/ws/src": false, "/ws/src/util": false });
  });

  it("writes explicit `false`, not just an omitted key — the caller merges this onto storage, which can't clear a key that's simply missing", () => {
    const next = collapseAllExpanded({ "/ws": true, "/ws/src": true }, root);
    expect(Object.prototype.hasOwnProperty.call(next, "/ws/src")).toBe(true);
    expect(next["/ws/src"]).toBe(false);
  });

  it("is a no-op map when nothing but the root was ever expanded", () => {
    expect(collapseAllExpanded({ "/ws": true }, root)).toEqual({
      "/ws": true,
    });
  });
});

describe("matchRowShortcut", () => {
  const chord = (
    init: Partial<RowKeyChord> & { key: string },
  ): RowKeyChord => ({
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...init,
  });

  // The row shortcuts bypass the keybinding registry, so they carry their own
  // platform mapping: Cmd on macOS, Ctrl everywhere else. Matching `metaKey`
  // on both platforms left all of them requiring the Windows key off-Mac.
  it("takes the primary modifier as Cmd on macOS", () => {
    expect(matchRowShortcut(chord({ key: "c", metaKey: true }), true)).toBe(
      "copy",
    );
    expect(
      matchRowShortcut(chord({ key: "c", ctrlKey: true }), true),
    ).toBeNull();
  });

  it("takes the primary modifier as Ctrl off macOS", () => {
    expect(matchRowShortcut(chord({ key: "c", ctrlKey: true }), false)).toBe(
      "copy",
    );
    expect(
      matchRowShortcut(chord({ key: "c", metaKey: true }), false),
    ).toBeNull();
  });

  it("opens on primary+Enter and renames on plain Enter", () => {
    expect(matchRowShortcut(chord({ key: "Enter", metaKey: true }), true)).toBe(
      "open",
    );
    expect(matchRowShortcut(chord({ key: "Enter" }), true)).toBe("rename");
    // Shift+Enter is the focus group's to handle, not the tree's.
    expect(
      matchRowShortcut(chord({ key: "Enter", shiftKey: true }), true),
    ).toBeNull();
  });

  it("separates the three copy chords by Alt and Shift", () => {
    const c = (init: Partial<RowKeyChord>) =>
      matchRowShortcut(chord({ key: "c", metaKey: true, ...init }), true);
    expect(c({})).toBe("copy");
    expect(c({ altKey: true })).toBe("copyPath");
    // Shift uppercases the reported key — the match folds case.
    expect(
      matchRowShortcut(
        chord({ key: "C", metaKey: true, altKey: true, shiftKey: true }),
        true,
      ),
    ).toBe("copyRelPath");
  });

  it("requires Alt for reveal and rejects decorated cut", () => {
    expect(
      matchRowShortcut(chord({ key: "r", metaKey: true, altKey: true }), true),
    ).toBe("reveal");
    expect(
      matchRowShortcut(chord({ key: "r", metaKey: true }), true),
    ).toBeNull();
    expect(matchRowShortcut(chord({ key: "x", metaKey: true }), true)).toBe(
      "cut",
    );
    expect(
      matchRowShortcut(chord({ key: "x", metaKey: true, altKey: true }), true),
    ).toBeNull();
  });

  it("deletes only with the primary modifier", () => {
    expect(
      matchRowShortcut(chord({ key: "Backspace", metaKey: true }), true),
    ).toBe("delete");
    expect(matchRowShortcut(chord({ key: "Backspace" }), true)).toBeNull();
  });

  it("ignores keys the tree does not bind", () => {
    expect(
      matchRowShortcut(chord({ key: "v", metaKey: true }), true),
    ).toBeNull();
    expect(matchRowShortcut(chord({ key: "a" }), true)).toBeNull();
  });
});

describe("rowAccelerators", () => {
  it("labels chords with Mac glyphs and spelled-out chords elsewhere", () => {
    expect(rowAccelerators(true).delete).toBe("⌘⌫");
    expect(rowAccelerators(false).delete).toBe("Ctrl+Backspace");
    expect(rowAccelerators(false).copyRelPath).toBe("Ctrl+Alt+Shift+C");
  });
});

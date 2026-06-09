import { describe, expect, it } from "vitest";
import { focusGroupNextIndex, isContextMenuKey } from "./use-focus-group";

// The hook itself is React-stateful; per the repo testing guide we test its pure
// core — the index math (`focusGroupNextIndex`) and the context-menu-key
// predicate — which is where the `workspace-list-nav` / `menu-nav` logic folded
// in. Rendered behavior is covered end-to-end by keyboard-nav.it.test.ts.

const all = () => true;

describe("focusGroupNextIndex", () => {
  describe("vertical orientation (the default list case)", () => {
    const nav = (current: number, count: number, key: string, wrap = true) =>
      focusGroupNextIndex({
        current,
        count,
        key,
        orientation: "vertical",
        wrap,
        isNavigable: all,
      });

    it("moves down and up between items", () => {
      expect(nav(0, 3, "ArrowDown")).toBe(1);
      expect(nav(2, 3, "ArrowUp")).toBe(1);
    });

    it("wraps at both ends when wrap is on", () => {
      expect(nav(2, 3, "ArrowDown")).toBe(0); // last → first
      expect(nav(0, 3, "ArrowUp")).toBe(2); // first → last
    });

    it("stops at the ends when wrap is off (returns null)", () => {
      expect(nav(2, 3, "ArrowDown", false)).toBeNull();
      expect(nav(0, 3, "ArrowUp", false)).toBeNull();
    });

    it("jumps to the ends with Home/End", () => {
      expect(nav(2, 4, "Home")).toBe(0);
      expect(nav(1, 4, "End")).toBe(3);
    });

    it("ignores the cross-axis arrows", () => {
      expect(nav(0, 3, "ArrowRight")).toBeNull();
      expect(nav(1, 3, "ArrowLeft")).toBeNull();
    });

    it("returns null for keys it doesn't handle", () => {
      expect(nav(0, 3, "Enter")).toBeNull();
      expect(nav(0, 3, "a")).toBeNull();
    });

    it("returns null for an empty list", () => {
      expect(nav(0, 0, "ArrowDown")).toBeNull();
      expect(nav(0, 0, "Home")).toBeNull();
    });

    it("returns null on a single-item list (nowhere else to go)", () => {
      expect(nav(0, 1, "ArrowDown")).toBeNull();
      expect(nav(0, 1, "ArrowUp")).toBeNull();
    });
  });

  describe("horizontal orientation", () => {
    const nav = (current: number, count: number, key: string) =>
      focusGroupNextIndex({
        current,
        count,
        key,
        orientation: "horizontal",
        wrap: true,
        isNavigable: all,
      });

    it("navigates with ←/→ and ignores ↑/↓", () => {
      expect(nav(0, 3, "ArrowRight")).toBe(1);
      expect(nav(0, 3, "ArrowLeft")).toBe(2); // wrap
      expect(nav(0, 3, "ArrowDown")).toBeNull();
      expect(nav(0, 3, "ArrowUp")).toBeNull();
    });

    it("still honors Home/End", () => {
      expect(nav(2, 4, "Home")).toBe(0);
      expect(nav(0, 4, "End")).toBe(3);
    });
  });

  describe("grid orientation steps linearly on all four arrows", () => {
    const nav = (current: number, count: number, key: string) =>
      focusGroupNextIndex({
        current,
        count,
        key,
        orientation: "grid",
        wrap: true,
        isNavigable: all,
      });

    it("treats Down/Right as +1 and Up/Left as -1", () => {
      expect(nav(1, 4, "ArrowDown")).toBe(2);
      expect(nav(1, 4, "ArrowRight")).toBe(2);
      expect(nav(1, 4, "ArrowUp")).toBe(0);
      expect(nav(1, 4, "ArrowLeft")).toBe(0);
    });
  });

  describe("isNavigable skips non-navigable items (separators/headers/disabled)", () => {
    // indices 1 and 3 are non-navigable (e.g. a separator + a disabled row).
    const isNavigable = (i: number) => i !== 1 && i !== 3;
    const nav = (current: number, key: string, wrap = true) =>
      focusGroupNextIndex({
        current,
        count: 5,
        key,
        orientation: "vertical",
        wrap,
        isNavigable,
      });

    it("hops over skipped indices going down", () => {
      expect(nav(0, "ArrowDown")).toBe(2); // skip 1
      expect(nav(2, "ArrowDown")).toBe(4); // skip 3
    });

    it("hops over skipped indices going up", () => {
      expect(nav(4, "ArrowUp")).toBe(2); // skip 3
      expect(nav(2, "ArrowUp")).toBe(0); // skip 1
    });

    it("wraps over a trailing skipped index", () => {
      expect(nav(4, "ArrowDown")).toBe(0); // 5(out)→wrap→0 navigable
    });

    it("lands Home/End on the first/last NAVIGABLE index", () => {
      expect(nav(2, "Home")).toBe(0);
      expect(nav(0, "End")).toBe(4); // 4 is navigable, 3 isn't
    });

    it("returns null when no other navigable item exists", () => {
      const onlyOne = (i: number) => i === 2;
      expect(
        focusGroupNextIndex({
          current: 2,
          count: 5,
          key: "ArrowDown",
          orientation: "vertical",
          wrap: true,
          isNavigable: onlyOne,
        }),
      ).toBeNull();
    });
  });
});

describe("isContextMenuKey", () => {
  it("matches the ContextMenu key and Shift+F10", () => {
    expect(isContextMenuKey({ key: "ContextMenu", shiftKey: false })).toBe(
      true,
    );
    expect(isContextMenuKey({ key: "F10", shiftKey: true })).toBe(true);
    expect(isContextMenuKey({ key: "ContextMenu", shiftKey: true })).toBe(true);
  });

  it("ignores plain F10 and other keys", () => {
    expect(isContextMenuKey({ key: "F10", shiftKey: false })).toBe(false);
    expect(isContextMenuKey({ key: "Enter", shiftKey: false })).toBe(false);
  });
});

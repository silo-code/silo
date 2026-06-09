import { describe, it, expect, beforeEach } from "vitest";
import { closeMenu, getMenu, openMenu } from "./menu-controller";

// `openMenu` is single-open: a second call replaces the first. The exception is
// the anchored-dropdown toggle (default on, behind `ctx.ui.showMenu`): re-opening
// with the same `anchor` closes the menu instead of reopening it, so a second
// click on a dropdown button dismisses it. These tests drive the controller
// state directly (open via `openMenu`, observe via `getMenu`).

const anchor = () => document.createElement("button");

beforeEach(() => {
  // Ensure no menu leaks between tests.
  closeMenu();
});

describe("openMenu toggle", () => {
  it("closes the menu when re-opened with the same anchor", () => {
    const a = anchor();
    void openMenu({ items: [], anchor: a });
    expect(getMenu()).not.toBeNull();

    void openMenu({ items: [], anchor: a });
    expect(getMenu()).toBeNull();
  });

  it("replaces (does not close) when re-opened with a different anchor", () => {
    const a = anchor();
    const b = anchor();
    void openMenu({ items: [], anchor: a });
    void openMenu({ items: [], anchor: b });

    expect(getMenu()?.anchor).toBe(b);
  });

  it("re-opens rather than toggles when toggle is false", () => {
    const a = anchor();
    void openMenu({ items: [], anchor: a });
    const firstId = getMenu()?.id;

    void openMenu({ items: [], anchor: a, toggle: false });
    const menu = getMenu();
    expect(menu).not.toBeNull();
    expect(menu?.anchor).toBe(a);
    // A fresh open: new id, prior promise resolved/replaced.
    expect(menu?.id).not.toBe(firstId);
  });

  it("never toggles an anchorless cursor menu", () => {
    void openMenu({ items: [], at: { x: 10, y: 10 } });
    // Re-opening another cursor menu replaces it; both have undefined anchor,
    // which must not be treated as a same-anchor match.
    void openMenu({ items: [], at: { x: 20, y: 20 } });

    expect(getMenu()).not.toBeNull();
    expect(getMenu()?.at).toEqual({ x: 20, y: 20 });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { MenuEntry, MenuItem } from "@silo-code/sdk";
import { Menu } from "./Menu";

// Integration guard for the one thing the pure index-math tests
// (`focusGroupNextIndex` in @silo-code/sdk, which the menu now shares) can't
// cover: keyboard navigation must work off a document-level listener,
// independent of where DOM focus landed (a menu opens hidden, so focus may not
// be inside it).
// Keys are dispatched from document.body — i.e. focus is NOT in the menu — and
// the highlight must still move. React act() warns without this flag.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount(items: MenuEntry[], onSelect: (i: MenuItem) => void) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
      <Menu
        items={items}
        placement={{ at: { x: 10, y: 10 } }}
        onSelect={onSelect}
        onClose={() => {}}
      />,
    );
  });
}

/** Dispatch a keydown from document.body so focus is deliberately not in the menu. */
function press(key: string) {
  act(() => {
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
    );
  });
}

const activeText = () =>
  document.querySelector(".silo-menu-item.active")?.textContent ?? null;

describe("Menu keyboard navigation", () => {
  const items: MenuEntry[] = [
    { type: "header", label: "Themes" },
    { label: "One" },
    { label: "Two", disabled: true },
    { label: "Three" },
  ];

  it("highlights the first focusable row on open", () => {
    mount(items, () => {});
    expect(activeText()).toBe("One"); // header skipped
  });

  it("moves the highlight with arrows even when focus is outside the menu", () => {
    mount(items, () => {});
    press("ArrowDown"); // One → Three (skips header + disabled Two)
    expect(activeText()).toBe("Three");
    press("ArrowDown"); // wrap back to One
    expect(activeText()).toBe("One");
    press("ArrowUp"); // wrap to last focusable
    expect(activeText()).toBe("Three");
  });

  it("runs the highlighted row on Enter", () => {
    const onSelect = vi.fn();
    mount(items, onSelect);
    press("ArrowDown"); // Three
    press("Enter");
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect((onSelect.mock.calls[0][0] as MenuItem).label).toBe("Three");
  });

  it("does not run a disabled or non-existent row", () => {
    const onSelect = vi.fn();
    mount([{ type: "header", label: "Only headers" }], onSelect);
    press("Enter");
    expect(onSelect).not.toHaveBeenCalled();
  });

  // Regression: opening a menu from a button, arrowing into it, then closing must
  // return focus to the opener. The old restore captured the element focused
  // *after* the mount focus effect (a menu row) and bailed when the closing menu
  // orphaned focus to <body> — so arrow-then-close stranded focus. Now the opener
  // is captured up front and focus is restored on an in-menu OR orphaned close.
  it("restores focus to the opener after arrowing into the menu and closing", () => {
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    expect(document.activeElement).toBe(opener);

    mount(items, () => {});
    press("ArrowDown"); // DOM focus moves onto a menu row

    act(() => root!.unmount()); // close (Escape / selection / teardown)
    root = null;

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

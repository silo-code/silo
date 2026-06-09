import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { statusItemRegistry } from "../extension-host/status-items";
import { StatusBar } from "./StatusBar";

// Integration guard for the status bar's pointer entry point: clicking the bar
// background (not an item) focuses the first item and shows the keyboard ring,
// so a click can hand off to tabbing. React act() warns without this flag.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;
const disposers: Array<() => void> = [];

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  for (const d of disposers.splice(0)) d();
});

function render() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(<StatusBar />));
  return document.querySelector<HTMLElement>(".status-bar")!;
}

function mouseDownOn(el: HTMLElement) {
  act(() => {
    el.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true }),
    );
  });
}

describe("StatusBar click-to-enter", () => {
  it("focuses the first item when the bar background is clicked", () => {
    disposers.push(
      statusItemRegistry.register({
        id: "a",
        alignment: "left",
        priority: 0,
        component: () => <button data-testid="first">A</button>,
      }).dispose,
      statusItemRegistry.register({
        id: "b",
        alignment: "right",
        priority: 0,
        component: () => <button>B</button>,
      }).dispose,
    );
    const bar = render();
    expect(document.activeElement).not.toBe(
      bar.querySelector('[data-testid="first"]'),
    );

    mouseDownOn(bar); // click the bar background

    const first = bar.querySelector<HTMLElement>('[data-testid="first"]');
    expect(document.activeElement).toBe(first);
    expect(first?.hasAttribute("data-focus-visible")).toBe(true); // ring shown
  });

  it("focuses the first item when the flex spacer is clicked", () => {
    disposers.push(
      statusItemRegistry.register({
        id: "a",
        alignment: "left",
        priority: 0,
        component: () => <button data-testid="first">A</button>,
      }).dispose,
    );
    const bar = render();
    const spacer = bar.querySelector<HTMLElement>(".spacer")!;

    mouseDownOn(spacer);

    expect(document.activeElement).toBe(
      bar.querySelector('[data-testid="first"]'),
    );
  });

  it("ignores clicks that land on an item button", () => {
    disposers.push(
      statusItemRegistry.register({
        id: "a",
        alignment: "left",
        priority: 0,
        component: () => <button data-testid="first">A</button>,
      }).dispose,
    );
    const bar = render();
    const btn = bar.querySelector<HTMLElement>('[data-testid="first"]')!;
    btn.blur();

    mouseDownOn(btn); // the controller must not hijack this

    // No ring forced on (pointer focus stays ring-less); the button's own click
    // semantics are left untouched.
    expect(btn.hasAttribute("data-focus-visible")).toBe(false);
  });
});

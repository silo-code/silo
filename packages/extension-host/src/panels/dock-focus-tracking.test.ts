import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { installDockFocusTracking } from "./dock-focus-tracking";

function makeDock(): HTMLElement {
  const dock = document.createElement("div");
  dock.className = "editor-dock";
  document.body.appendChild(dock);
  return dock;
}

describe("installDockFocusTracking", () => {
  let dock: HTMLElement;

  beforeEach(() => {
    installDockFocusTracking();
    dock = makeDock();
  });

  afterEach(() => {
    dock.remove();
  });

  it("adds dock-has-focus when focus lands on a descendant", () => {
    const child = document.createElement("input");
    dock.appendChild(child);
    child.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(dock.classList.contains("dock-has-focus")).toBe(true);
  });

  it("adds dock-has-focus when focus lands on an iframe descendant — the case :focus-within missed", () => {
    // The bug this exists for: clicking into a cross-origin iframe makes
    // `document.activeElement` the <iframe> element itself, which this
    // WebView's `:focus-within` didn't reliably propagate to ancestors.
    // A plain focusin + containment check doesn't care what kind of element
    // it is, iframe included.
    const iframe = document.createElement("iframe");
    dock.appendChild(iframe);
    iframe.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(dock.classList.contains("dock-has-focus")).toBe(true);
  });

  it("removes dock-has-focus once focus moves outside the dock", () => {
    const child = document.createElement("input");
    dock.appendChild(child);
    child.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(dock.classList.contains("dock-has-focus")).toBe(true);

    const outside = document.createElement("input");
    document.body.appendChild(outside);
    outside.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(dock.classList.contains("dock-has-focus")).toBe(false);
    outside.remove();
  });

  it("clears dock-has-focus on window blur (a real app-level focus loss)", () => {
    const child = document.createElement("input");
    dock.appendChild(child);
    child.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
    expect(dock.classList.contains("dock-has-focus")).toBe(true);

    window.dispatchEvent(new FocusEvent("blur"));
    expect(dock.classList.contains("dock-has-focus")).toBe(false);
  });
});

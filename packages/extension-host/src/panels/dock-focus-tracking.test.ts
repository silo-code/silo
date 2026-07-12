import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  vi,
} from "vitest";
import { installDockFocusTracking } from "./dock-focus-tracking";

function makeDock(): HTMLElement {
  const dock = document.createElement("div");
  dock.className = "editor-dock";
  document.body.appendChild(dock);
  return dock;
}

/** Point `document.activeElement` at `el` without dispatching any event —
 * simulates a cross-origin iframe click, which moves focus into the iframe
 * without ever notifying the parent document via `focusin`. */
function setActiveElementSilently(el: Element) {
  Object.defineProperty(document, "activeElement", {
    value: el,
    configurable: true,
  });
}

describe("installDockFocusTracking", () => {
  let dock: HTMLElement;

  // Fake timers must be active before the module's one-time `setInterval` is
  // ever created (installDockFocusTracking() is a guarded singleton — it
  // only runs its setup once, on the very first call across this whole
  // file), or the interval never comes under fake-timer control and
  // `vi.advanceTimersByTime` can't drive it.
  beforeAll(() => {
    vi.useFakeTimers();
    installDockFocusTracking();
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    dock = makeDock();
  });

  afterEach(() => {
    dock.remove();
    Object.defineProperty(document, "activeElement", {
      value: document.body,
      configurable: true,
    });
  });

  it("adds dock-has-focus when focus lands on a descendant", () => {
    const child = document.createElement("input");
    dock.appendChild(child);
    child.dispatchEvent(new FocusEvent("focusin", { bubbles: true }));
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

  it("picks up an iframe becoming activeElement via polling, even with no focusin event — the case :focus-within and focusin both missed", () => {
    // The bug this exists for: clicking into a cross-origin iframe's
    // *rendered content* moves focus into it, but cross-origin iframe
    // content doesn't forward DOM events (mouse or focus) to the parent
    // document at all — so `document.activeElement` becomes the <iframe>
    // with nothing observable via a `focusin` listener. Only polling
    // `document.activeElement` directly catches this.
    const iframe = document.createElement("iframe");
    dock.appendChild(iframe);
    setActiveElementSilently(iframe);
    expect(dock.classList.contains("dock-has-focus")).toBe(false); // not yet — no poll tick

    vi.advanceTimersByTime(150);
    expect(dock.classList.contains("dock-has-focus")).toBe(true);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cycleRegionFocus,
  enterRegionOnPointer,
  installRegionTabHandoff,
  regionOf,
} from "./focus-regions";
import {
  focusCenterDock,
  supersedeCenterRetry,
} from "../docked/dock-api-registry";
import { registerSidePane } from "../layout/side-pane-registry";
import { store } from "../state/store";

// Isolate the region MODEL (cycle order / skipping / Tab handoff / click-to-enter)
// from the center's async retry machinery: mock dock-api-registry so the center
// region's entry is a deterministic, synchronous focus we control. focusCenterDock
// itself is covered by dock-api-registry.test.ts.
vi.mock("../docked/dock-api-registry", () => ({
  focusCenterDock: vi.fn(() => false),
  supersedeCenterRetry: vi.fn(),
}));
const mockCenter = vi.mocked(focusCenterDock);

// Side-pane controllers register into a module-level map; track + dispose them so
// a collapsed-dock test's registration can't leak into later tests.
const sidePaneDisposers: Array<() => void> = [];

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
  for (const dispose of sidePaneDisposers.splice(0)) dispose();
  store.leftPanelAutoHidden = false;
  store.rightPanelAutoHidden = false;
});

// ── DOM builders (jsdom has no layout, so side-pane visibility is stubbed via a
// defined clientWidth, matching the `clientWidth > 0` check the model uses) ──

function sidePane(slot: "left" | "right" | "left-bottom"): HTMLButtonElement {
  const pane = document.createElement("div");
  pane.className = "side-pane";
  pane.dataset.slot = slot;
  Object.defineProperty(pane, "clientWidth", {
    value: 200,
    configurable: true,
  });
  const tab = document.createElement("div");
  tab.className = "tab-pane";
  tab.dataset.active = "true";
  const item = document.createElement("button");
  tab.appendChild(item);
  pane.appendChild(tab);
  document.body.appendChild(pane);
  return item;
}

// A collapsed side dock: the resizable panel clips it to zero width but keeps it
// mounted, so its tab button is still in the DOM and its controller registered.
// clientWidth === 0 is the "not shown" signal the model reads.
function collapsedSidePane(side: "left" | "right", panelId = "p"): void {
  const pane = document.createElement("div");
  pane.className = "side-pane";
  pane.dataset.slot = side;
  Object.defineProperty(pane, "clientWidth", { value: 0, configurable: true });
  const tab = document.createElement("button");
  tab.className = "tab";
  tab.dataset.panelId = panelId;
  pane.appendChild(tab);
  document.body.appendChild(pane);
  const { dispose } = registerSidePane(side, {
    panelIds: () => [panelId],
    activeId: () => panelId,
    activate: () => {},
  });
  sidePaneDisposers.push(dispose);
}

function statusBar(): HTMLButtonElement {
  const bar = document.createElement("div");
  bar.className = "status-bar";
  const item = document.createElement("button");
  bar.appendChild(item);
  document.body.appendChild(bar);
  return item;
}

// A center region whose entry deterministically focuses `el` (or, when empty,
// returns false so the cycle skips it).
function centerWith(el: HTMLElement | null): void {
  if (el) {
    const body = document.createElement("div");
    body.className = "center-body";
    body.appendChild(el);
    document.body.appendChild(body);
    mockCenter.mockImplementation(() => {
      el.focus();
      return true;
    });
  } else {
    mockCenter.mockReturnValue(false);
  }
}

describe("regionOf", () => {
  it("maps an element to the region that contains it", () => {
    const left = sidePane("left");
    const right = sidePane("right");
    const status = statusBar();
    const editor = document.createElement("textarea");
    centerWith(editor);

    expect(regionOf(left)?.id).toBe("left");
    expect(regionOf(right)?.id).toBe("right");
    expect(regionOf(status)?.id).toBe("statusbar");
    expect(regionOf(editor)?.id).toBe("center");
  });

  it("returns null outside every region, and for null", () => {
    const stray = document.createElement("button");
    document.body.appendChild(stray);
    expect(regionOf(stray)).toBeNull();
    expect(regionOf(null)).toBeNull();
  });
});

describe("cycleRegionFocus", () => {
  it("steps Left → Center → Right → Status bar and wraps, forward", () => {
    const left = sidePane("left");
    const right = sidePane("right");
    const status = statusBar();
    const editor = document.createElement("textarea");
    centerWith(editor);

    left.focus();
    expect(cycleRegionFocus(1)).toBe(true);
    expect(document.activeElement).toBe(editor); // → center

    expect(cycleRegionFocus(1)).toBe(true);
    expect(document.activeElement).toBe(right); // → right

    expect(cycleRegionFocus(1)).toBe(true);
    expect(document.activeElement).toBe(status); // → status bar

    expect(cycleRegionFocus(1)).toBe(true);
    expect(document.activeElement).toBe(left); // wraps → left
  });

  it("steps backward and wraps", () => {
    const left = sidePane("left");
    const status = statusBar();
    const editor = document.createElement("textarea");
    centerWith(editor);

    left.focus();
    expect(cycleRegionFocus(-1)).toBe(true);
    expect(document.activeElement).toBe(status); // wraps back → status bar
    expect(cycleRegionFocus(-1)).toBe(true);
    expect(document.activeElement).toBe(editor); // → center (right is absent)
  });

  it("skips a collapsed/absent side dock", () => {
    // No right dock. Center → forward should skip right and land on the bar.
    const status = statusBar();
    const editor = document.createElement("textarea");
    centerWith(editor);
    editor.focus();
    expect(cycleRegionFocus(1)).toBe(true);
    expect(document.activeElement).toBe(status);
  });

  it("skips a side dock that is mounted but collapsed (not shown)", () => {
    // A collapsed dock keeps its tab button focusable, so the entry's
    // tab-button fallback must NOT land on it — it isn't shown.
    collapsedSidePane("left");
    const editor = document.createElement("textarea");
    centerWith(editor); // only the center can take focus
    editor.focus();
    // Backward from center would step onto left; it must skip the collapsed dock
    // (and the absent right/status), leaving focus on the center.
    expect(cycleRegionFocus(-1)).toBe(false);
    expect(document.activeElement).toBe(editor);
  });

  it("skips a side dock that small-screen mode auto-hid, even though it's rendered at full width (a peek)", () => {
    // Full clientWidth (200) — as if genuinely peeking — but flagged
    // autoHidden, which alone must be enough to exclude it: peek is a
    // mouse-only affordance with no keyboard gesture to invoke it.
    sidePane("left");
    const editor = document.createElement("textarea");
    centerWith(editor);
    store.leftPanelAutoHidden = true;

    editor.focus();
    expect(cycleRegionFocus(-1)).toBe(false);
    expect(document.activeElement).toBe(editor);
  });

  it("skips an empty center (focusEntry returns false)", () => {
    const left = sidePane("left");
    const status = statusBar();
    centerWith(null); // empty center
    left.focus();
    expect(cycleRegionFocus(1)).toBe(true);
    expect(document.activeElement).toBe(status); // left → (center skipped) → status
  });

  it("pivots on the center when focus is outside every region", () => {
    const left = sidePane("left");
    const right = sidePane("right");
    const editor = document.createElement("textarea");
    centerWith(editor);
    document.body.focus(); // focus nowhere in a region

    expect(cycleRegionFocus(1)).toBe(true);
    expect(document.activeElement).toBe(right); // center+1 → right
    right.blur();
    document.body.focus();
    expect(cycleRegionFocus(-1)).toBe(true);
    expect(document.activeElement).toBe(left); // center-1 → left
  });

  it("returns false when no other region can take focus", () => {
    const editor = document.createElement("textarea");
    centerWith(editor); // only the center is present
    editor.focus();
    expect(cycleRegionFocus(1)).toBe(false);
  });
});

describe("installRegionTabHandoff", () => {
  let dispose: () => void;
  beforeEach(() => {
    dispose = installRegionTabHandoff();
  });
  afterEach(() => dispose());

  function pressTab(opts: Partial<KeyboardEventInit> = {}): KeyboardEvent {
    const e = new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
      ...opts,
    });
    (document.activeElement ?? document.body).dispatchEvent(e);
    return e;
  }

  it("hands off to the next region when Tab leaves a side dock's last tabbable", () => {
    const left = sidePane("left");
    const second = document.createElement("button"); // a 2nd left tabbable
    left.parentElement!.appendChild(second);
    const editor = document.createElement("textarea");
    centerWith(editor);

    second.focus(); // the last tabbable in the left dock
    const e = pressTab();
    expect(e.defaultPrevented).toBe(true);
    expect(mockCenter).toHaveBeenCalled();
    expect(document.activeElement).toBe(editor);
  });

  it("never hands off out of a small-screen-auto-hidden dock, even from its last tabbable", () => {
    const left = sidePane("left");
    centerWith(document.createElement("textarea"));
    store.leftPanelAutoHidden = true;

    left.focus(); // its only (so "last") tabbable
    const e = pressTab();
    expect(e.defaultPrevented).toBe(false);
    expect(mockCenter).not.toHaveBeenCalled();
  });

  it("does not hand off from a non-last tabbable", () => {
    const left = sidePane("left");
    const second = document.createElement("button");
    left.parentElement!.appendChild(second);
    centerWith(document.createElement("textarea"));

    left.focus(); // NOT the last tabbable
    const e = pressTab();
    expect(e.defaultPrevented).toBe(false);
    expect(mockCenter).not.toHaveBeenCalled();
  });

  it("hands the right dock off to the status bar (generalized boundary)", () => {
    const right = sidePane("right");
    const status = statusBar();
    centerWith(document.createElement("textarea"));

    right.focus(); // last (only) right tabbable
    const e = pressTab();
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(status);
  });

  it("ignores Shift+Tab and modified Tab, and Tab from the center", () => {
    const left = sidePane("left");
    centerWith(document.createElement("textarea"));
    left.focus();
    expect(pressTab({ shiftKey: true }).defaultPrevented).toBe(false);
    expect(pressTab({ metaKey: true }).defaultPrevented).toBe(false);
    // Center has no `tabbables()` → never hands off.
    const editor = document.querySelector("textarea")!;
    (editor as HTMLElement).focus();
    expect(pressTab().defaultPrevented).toBe(false);
  });

  it("wraps the status bar's last item to the first region (no empty body stop)", () => {
    const left = sidePane("left");
    const status = statusBar();
    centerWith(document.createElement("textarea"));

    status.focus(); // the last (only) status item — would hit <body> on a bare Tab
    const e = pressTab();
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(left); // wrapped straight to the left dock
  });

  it("skips an empty/absent region when wrapping (status → center, left absent)", () => {
    const editor = document.createElement("textarea");
    centerWith(editor); // center present; no left/right docks
    const status = statusBar();

    status.focus();
    const e = pressTab();
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(editor); // left absent → skip → center
  });
});

describe("enterRegionOnPointer (unified click-to-enter)", () => {
  it("focuses the active pane's first tabbable on a background click", () => {
    const item = sidePane("left");
    const pane = item.closest(".side-pane")!;
    expect(enterRegionOnPointer(pane)).toBe(true);
    expect(document.activeElement).toBe(item);
    expect(supersedeCenterRetry).toHaveBeenCalled();
  });

  it("enters the SPECIFIC pane clicked (per-pane precision)", () => {
    sidePane("left");
    const bottomItem = sidePane("left-bottom");
    expect(enterRegionOnPointer(bottomItem.closest(".side-pane"))).toBe(true);
    expect(document.activeElement).toBe(bottomItem);
  });

  it("does nothing when a real control is clicked (it focuses itself)", () => {
    const item = sidePane("left");
    expect(enterRegionOnPointer(item)).toBe(false); // the button is INTERACTIVE
    expect(document.activeElement).not.toBe(item);
  });

  it("focuses the first status-bar item on a bar-background click", () => {
    const item = statusBar();
    const bar = item.closest(".status-bar")!;
    expect(enterRegionOnPointer(bar)).toBe(true);
    expect(document.activeElement).toBe(item);
  });

  it("returns false for a non-element target and outside any region", () => {
    expect(enterRegionOnPointer(null)).toBe(false);
    const stray = document.createElement("div");
    document.body.appendChild(stray);
    expect(enterRegionOnPointer(stray)).toBe(false);
  });
});

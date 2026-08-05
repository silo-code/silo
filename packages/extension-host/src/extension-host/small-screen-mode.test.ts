import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computeSmallScreenActive,
  nextPeekWidthPx,
  beginPeekResize,
  installSmallScreenMode,
} from "./small-screen-mode";
import {
  store,
  setLeftPanelCollapsed,
  setRightPanelCollapsed,
} from "../state/store";
import {
  DEFAULT_SMALL_SCREEN_THRESHOLD_PX,
  DEFAULT_SMALL_SCREEN_PEEK_WIDTH_PX,
  MIN_SMALL_SCREEN_PEEK_WIDTH_PX,
  MAX_SMALL_SCREEN_PEEK_WIDTH_PX,
} from "../state/types";

function setInnerWidth(px: number): void {
  Object.defineProperty(window, "innerWidth", {
    value: px,
    configurable: true,
    writable: true,
  });
}

function resetStore(): void {
  store.leftPanelCollapsed = false;
  store.rightPanelCollapsed = false;
  store.smallScreenActive = false;
  store.inactiveModeCollapsed = null;
  store.leftPanelPeeking = false;
  store.rightPanelPeeking = false;
  store.leftPanelPeekDragging = false;
  store.rightPanelPeekDragging = false;
  store.smallScreenPeekWidthLeftPx = DEFAULT_SMALL_SCREEN_PEEK_WIDTH_PX;
  store.smallScreenPeekWidthRightPx = DEFAULT_SMALL_SCREEN_PEEK_WIDTH_PX;
  store.smallScreenModeEnabled = true;
  store.smallScreenThresholdPx = DEFAULT_SMALL_SCREEN_THRESHOLD_PX;
  store.workspaces = {};
  store.workspaceOrder = [];
  store.activeWorkspaceId = null;
}

function moveMouse(x: number, target: EventTarget = document): void {
  target.dispatchEvent(
    new MouseEvent("mousemove", { clientX: x, bubbles: true }),
  );
}

/** A side column split into a top + bottom pane (bottom-docked panel), both
 * nested in AppShell's peek wrapper — mirrors the real DOM `.side-peek-host`
 * wraps around `<SideColumn>`, which renders two `.side-pane` elements when
 * split. Returns the bottom pane's element to dispatch events "on". */
function renderSplitSideColumn(side: "left" | "right"): HTMLElement {
  const host = document.createElement("div");
  host.className = `side-peek-host side-peek-host--${side}`;
  const top = document.createElement("div");
  top.className = "side-pane";
  top.dataset.slot = side;
  const bottom = document.createElement("div");
  bottom.className = "side-pane";
  bottom.dataset.slot = `${side}-bottom`;
  host.append(top, bottom);
  document.body.appendChild(host);
  return bottom;
}

describe("computeSmallScreenActive", () => {
  it("enters small-screen once width drops below the raw threshold", () => {
    expect(computeSmallScreenActive(false, 1439, 1440, 80)).toBe(true);
    expect(computeSmallScreenActive(false, 1440, 1440, 80)).toBe(false);
  });

  it("stays active inside the hysteresis band once already active", () => {
    // Below threshold+hysteresis but at/above threshold — the dead zone.
    expect(computeSmallScreenActive(true, 1500, 1440, 80)).toBe(true);
  });

  it("exits small-screen only once width clears threshold + hysteresis", () => {
    expect(computeSmallScreenActive(true, 1519, 1440, 80)).toBe(true);
    expect(computeSmallScreenActive(true, 1520, 1440, 80)).toBe(false);
  });

  it("stays active well below threshold regardless of hysteresis", () => {
    expect(computeSmallScreenActive(true, 800, 1440, 80)).toBe(true);
  });
});

describe("installSmallScreenMode", () => {
  let dispose: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    resetStore();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    dispose?.();
    vi.useRealTimers();
  });

  it("switches to small-screen mode's own layout immediately when launched already small", () => {
    setInnerWidth(1200);
    dispose = installSmallScreenMode();

    expect(store.smallScreenActive).toBe(true);
    // Nothing recorded for this workspace yet → both columns out of the way.
    expect(store.leftPanelCollapsed).toBe(true);
    expect(store.rightPanelCollapsed).toBe(true);
    // ...with the normal-width layout waiting off screen.
    expect(store.inactiveModeCollapsed).toEqual({ left: false, right: false });
  });

  it("does nothing when launched already large", () => {
    setInnerWidth(1800);
    dispose = installSmallScreenMode();

    expect(store.smallScreenActive).toBe(false);
    expect(store.leftPanelCollapsed).toBe(false);
    expect(store.inactiveModeCollapsed).toBeNull();
  });

  it("switches modes on a debounced resize below threshold", () => {
    setInnerWidth(1800);
    dispose = installSmallScreenMode();
    expect(store.leftPanelCollapsed).toBe(false);

    setInnerWidth(1000);
    window.dispatchEvent(new Event("resize"));
    // Not yet — resize is debounced.
    expect(store.leftPanelCollapsed).toBe(false);

    vi.advanceTimersByTime(250);
    expect(store.smallScreenActive).toBe(true);
    expect(store.leftPanelCollapsed).toBe(true);
  });

  it("restores the normal-width layout once the screen grows past the hysteresis band", () => {
    setInnerWidth(1000);
    dispose = installSmallScreenMode();
    expect(store.leftPanelCollapsed).toBe(true);

    setInnerWidth(1440); // exactly at threshold — inside the hysteresis dead zone
    window.dispatchEvent(new Event("resize"));
    vi.advanceTimersByTime(250);
    expect(store.leftPanelCollapsed).toBe(true); // hasn't cleared threshold+hysteresis

    setInnerWidth(1600); // clears threshold + 80px hysteresis
    window.dispatchEvent(new Event("resize"));
    vi.advanceTimersByTime(250);
    expect(store.smallScreenActive).toBe(false);
    expect(store.leftPanelCollapsed).toBe(false);
  });

  it("keeps a panel the user collapsed on a wide window collapsed when it comes back", () => {
    setInnerWidth(1800);
    setLeftPanelCollapsed(true); // part of the normal-width layout
    dispose = installSmallScreenMode();

    setInnerWidth(1000);
    window.dispatchEvent(new Event("resize"));
    vi.advanceTimersByTime(250);
    expect(store.leftPanelCollapsed).toBe(true);

    setInnerWidth(1800);
    window.dispatchEvent(new Event("resize"));
    vi.advanceTimersByTime(250);
    expect(store.leftPanelCollapsed).toBe(true);
  });

  it("keeps what the user did on the narrow window out of the wide layout", () => {
    setInnerWidth(1800);
    dispose = installSmallScreenMode();

    setInnerWidth(1000);
    window.dispatchEvent(new Event("resize"));
    vi.advanceTimersByTime(250);
    // Reopen one column and close the other — both narrow-window decisions.
    setLeftPanelCollapsed(false);
    setRightPanelCollapsed(true);

    setInnerWidth(1800);
    window.dispatchEvent(new Event("resize"));
    vi.advanceTimersByTime(250);
    expect(store.leftPanelCollapsed).toBe(false);
    expect(store.rightPanelCollapsed).toBe(false);
  });

  it("brings the small-screen layout back the next time the window is narrow", () => {
    setInnerWidth(1800);
    dispose = installSmallScreenMode();

    setInnerWidth(1000);
    window.dispatchEvent(new Event("resize"));
    vi.advanceTimersByTime(250);
    setLeftPanelCollapsed(false); // "I want the left panel open on the laptop"

    setInnerWidth(1800);
    window.dispatchEvent(new Event("resize"));
    vi.advanceTimersByTime(250);
    expect(store.leftPanelCollapsed).toBe(false); // wide layout, untouched

    setInnerWidth(1000);
    window.dispatchEvent(new Event("resize"));
    vi.advanceTimersByTime(250);
    // ...and the narrow window picks up exactly where it left off, rather
    // than starting over from "hide everything".
    expect(store.leftPanelCollapsed).toBe(false);
    expect(store.rightPanelCollapsed).toBe(true);
  });

  it("leaves small-screen mode immediately when the feature is disabled", async () => {
    setInnerWidth(1000);
    dispose = installSmallScreenMode();
    expect(store.leftPanelCollapsed).toBe(true);

    store.smallScreenModeEnabled = false;
    await Promise.resolve(); // subscribe's notification is microtask-batched

    expect(store.smallScreenActive).toBe(false);
    expect(store.leftPanelCollapsed).toBe(false);
  });

  it("peeks a collapsed left panel after a dwell at the edge, and hides it again after the mouse leaves", () => {
    setInnerWidth(1000);
    dispose = installSmallScreenMode();
    expect(store.leftPanelCollapsed).toBe(true);

    moveMouse(2); // within the edge hotspot
    vi.advanceTimersByTime(100);
    expect(store.leftPanelPeeking).toBe(false); // dwell not elapsed yet

    vi.advanceTimersByTime(200);
    expect(store.leftPanelPeeking).toBe(true);

    moveMouse(900); // far from the edge, no pane element in the DOM to be "within"
    vi.advanceTimersByTime(300);
    expect(store.leftPanelPeeking).toBe(true); // grace not elapsed yet

    vi.advanceTimersByTime(200);
    expect(store.leftPanelPeeking).toBe(false);
  });

  it("stays peeking while the cursor is over the bottom pane of a split side column", () => {
    // Regression: a split side column (a panel docked at the bottom) renders
    // two .side-pane elements. The peek used to measure cursor containment
    // against only the first one found, so hovering the *bottom* pane's tab
    // bar/content read as "left the peek" and hid it after the grace timer.
    setInnerWidth(1000);
    dispose = installSmallScreenMode();
    const bottomPane = renderSplitSideColumn("left");

    moveMouse(2); // dwell at the edge
    vi.advanceTimersByTime(300);
    expect(store.leftPanelPeeking).toBe(true);

    moveMouse(150, bottomPane); // far from the edge, but over the bottom pane
    vi.advanceTimersByTime(1000); // well past the grace delay
    expect(store.leftPanelPeeking).toBe(true);
  });

  it("peeks a panel the user collapsed themselves, on a full-size window", () => {
    // Peek isn't small-screen mode's alone: any collapsed side panel is one
    // edge-hover away, however it got collapsed and at any window size.
    setInnerWidth(1800);
    setLeftPanelCollapsed(true);
    dispose = installSmallScreenMode();
    expect(store.smallScreenActive).toBe(false);

    moveMouse(2);
    vi.advanceTimersByTime(1000);
    expect(store.leftPanelPeeking).toBe(true);
  });

  it("peeks a panel closed by hand while narrow, and never peeks an open one", () => {
    setInnerWidth(1000);
    dispose = installSmallScreenMode();
    setLeftPanelCollapsed(false); // opened on the narrow window...

    moveMouse(2);
    vi.advanceTimersByTime(1000);
    expect(store.leftPanelPeeking).toBe(false); // nothing to peek, it's open

    setLeftPanelCollapsed(true); // ...then closed again by hand
    moveMouse(2);
    vi.advanceTimersByTime(1000);
    expect(store.leftPanelPeeking).toBe(true);
  });

  it("keeps peeking through a resize drag even once the cursor leaves the pre-drag peek-host bounds", () => {
    // Regression scenario this guards against: growing the overlay naturally
    // carries the cursor away from wherever the (pre-drag) peek host and edge
    // hotspot were, which — without the peekDragging escape hatch — would read
    // as "left the peek" mid-drag and hide it out from under the user.
    setInnerWidth(1000);
    dispose = installSmallScreenMode();
    expect(store.leftPanelCollapsed).toBe(true); // already small at launch
    store.leftPanelPeeking = true; // as if already peeking

    const dragDispose = beginPeekResize("left", 280);
    expect(store.leftPanelPeekDragging).toBe(true);

    moveMouse(900); // far from the edge and outside any peek host in the DOM
    vi.advanceTimersByTime(1000);
    expect(store.leftPanelPeeking).toBe(true);

    dragDispose();
    expect(store.leftPanelPeekDragging).toBe(false);
  });
});

describe("nextPeekWidthPx", () => {
  it("grows the left panel's overlay when dragging right, shrinks the right panel's", () => {
    expect(nextPeekWidthPx("left", 280, 50)).toBe(330);
    expect(nextPeekWidthPx("right", 280, 50)).toBe(230);
  });

  it("clamps to the configured min/max range", () => {
    expect(nextPeekWidthPx("left", 280, -1000)).toBe(
      MIN_SMALL_SCREEN_PEEK_WIDTH_PX,
    );
    expect(nextPeekWidthPx("left", 280, 1000)).toBe(
      MAX_SMALL_SCREEN_PEEK_WIDTH_PX,
    );
  });
});

describe("beginPeekResize", () => {
  afterEach(() => {
    store.leftPanelPeekDragging = false;
    store.smallScreenPeekWidthLeftPx = DEFAULT_SMALL_SCREEN_PEEK_WIDTH_PX;
  });

  it("updates the global peek width live as the mouse moves, and stops on mouseup", () => {
    store.smallScreenPeekWidthLeftPx = 280;
    beginPeekResize("left", 100);

    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 150 }));
    expect(store.smallScreenPeekWidthLeftPx).toBe(330);

    window.dispatchEvent(new MouseEvent("mouseup"));
    expect(store.leftPanelPeekDragging).toBe(false);

    // No longer listening — a further move doesn't change anything.
    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 400 }));
    expect(store.smallScreenPeekWidthLeftPx).toBe(330);
  });

  it("the returned disposer also stops the drag", () => {
    store.smallScreenPeekWidthLeftPx = 280;
    const dispose = beginPeekResize("left", 100);
    dispose();
    expect(store.leftPanelPeekDragging).toBe(false);

    window.dispatchEvent(new MouseEvent("mousemove", { clientX: 400 }));
    expect(store.smallScreenPeekWidthLeftPx).toBe(280);
  });
});

describe("installSmallScreenMode: iframe crossing", () => {
  let dispose: () => void;

  beforeEach(() => {
    vi.useFakeTimers();
    resetStore();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    dispose?.();
    vi.useRealTimers();
  });

  it("hides a peek once the cursor crosses onto a webview, even with no further mousemove", () => {
    // Regression: a cross-origin <iframe> (e.g. local-web-viewer in the center
    // dock) swallows mousemove entirely once the cursor is over it — the
    // parent document never gets another one to notice the cursor left. Entry
    // fires a normal `mouseover` on the iframe element itself, though, which
    // is the only signal we get.
    setInnerWidth(1000);
    dispose = installSmallScreenMode();
    moveMouse(2); // dwell at the edge
    vi.advanceTimersByTime(300);
    expect(store.leftPanelPeeking).toBe(true);

    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    iframe.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    // No further mousemove ever arrives — the grace timer alone must do it.
    vi.advanceTimersByTime(500);

    expect(store.leftPanelPeeking).toBe(false);
  });

  it("does not force-close mid-drag just because the cursor grazes an iframe", () => {
    setInnerWidth(1000);
    dispose = installSmallScreenMode();
    expect(store.leftPanelCollapsed).toBe(true);
    store.leftPanelPeeking = true;
    beginPeekResize("left", 280);

    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    iframe.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    vi.advanceTimersByTime(1000);

    expect(store.leftPanelPeeking).toBe(true);
  });
});

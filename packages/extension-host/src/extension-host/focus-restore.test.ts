import { afterEach, describe, expect, it } from "vitest";
import { restoreTarget } from "./focus-restore";

// Build a `.side-pane` region with a focusable button inside it.
function regionButton(): HTMLButtonElement {
  const pane = document.createElement("div");
  pane.className = "side-pane";
  const btn = document.createElement("button");
  pane.appendChild(btn);
  document.body.appendChild(pane);
  return btn;
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("restoreTarget", () => {
  it("restores the last region element when focus was dropped to the body", () => {
    const last = regionButton();
    expect(restoreTarget(document.body, last)).toBe(last);
  });

  it("leaves focus alone when it already sits on a region element", () => {
    const current = regionButton();
    const last = regionButton();
    expect(restoreTarget(current, last)).toBeNull();
  });

  it("does not restore an element that left the DOM", () => {
    const last = regionButton();
    last.parentElement!.remove(); // workspace/panel closed while away
    expect(restoreTarget(document.body, last)).toBeNull();
  });

  it("does not restore a remembered element outside any region", () => {
    const stray = document.createElement("button");
    document.body.appendChild(stray);
    expect(restoreTarget(document.body, stray)).toBeNull();
  });

  it("returns null when there is nothing to restore", () => {
    expect(restoreTarget(document.body, null)).toBeNull();
  });
});

// Build a `.dock-host` (as CenterDock.tsx renders one per visited workspace,
// toggling `data-active`) with a focusable button inside it, nested in a
// shared `.center-body` the way every dock-host actually is.
function dockHostButton(active: boolean): HTMLButtonElement {
  const centerBody = document.createElement("div");
  centerBody.className = "center-body";
  const host = document.createElement("div");
  host.className = "dock-host";
  host.dataset.active = String(active);
  const btn = document.createElement("button");
  host.appendChild(btn);
  centerBody.appendChild(host);
  document.body.appendChild(centerBody);
  return btn;
}

describe("restoreTarget — dock-host scoping", () => {
  it("does not restore an element inside a backgrounded dock-host", () => {
    const last = dockHostButton(false);
    expect(restoreTarget(document.body, last)).toBeNull();
  });

  it("restores an element inside the active dock-host", () => {
    const last = dockHostButton(true);
    expect(restoreTarget(document.body, last)).toBe(last);
  });

  it("restores a side-pane element unaffected by dock-host scoping", () => {
    const last = regionButton(); // not inside any .dock-host
    expect(restoreTarget(document.body, last)).toBe(last);
  });

  it("honors an injected scope predicate over the real dock-liveness check", () => {
    const last = dockHostButton(true); // live per the real DOM check
    expect(restoreTarget(document.body, last, () => false)).toBeNull();
  });
});

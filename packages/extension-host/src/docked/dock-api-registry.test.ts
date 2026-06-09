import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { activeCenterTarget, focusCenterDock } from "./dock-api-registry";

// focusCenterDock kicks off an async focus retry (requestAnimationFrame); stub
// it to a no-op so these assert only the synchronous "is there content" verdict
// the Tab handoff relies on, without running the retry loop.
describe("focusCenterDock", () => {
  let origRaf: typeof globalThis.requestAnimationFrame;
  beforeEach(() => {
    origRaf = globalThis.requestAnimationFrame;
    globalThis.requestAnimationFrame = (() =>
      0) as unknown as typeof globalThis.requestAnimationFrame;
  });
  afterEach(() => {
    globalThis.requestAnimationFrame = origRaf;
    document.body.innerHTML = "";
  });

  function activeCenterHost(): HTMLElement {
    const body = document.createElement("div");
    body.className = "center-body";
    const host = document.createElement("div");
    host.className = "dock-host";
    host.dataset.active = "true";
    body.appendChild(host);
    document.body.appendChild(body);
    return host;
  }

  it("returns false when there is no active center dock host", () => {
    expect(focusCenterDock()).toBe(false);
  });

  it("returns false when the active host has nothing to land on", () => {
    activeCenterHost();
    expect(focusCenterDock()).toBe(false);
  });

  it("returns true when the active host holds an editor/terminal textarea", () => {
    activeCenterHost().appendChild(document.createElement("textarea"));
    expect(focusCenterDock()).toBe(true);
  });

  it("returns true when the active host holds a focusable control", () => {
    activeCenterHost().appendChild(document.createElement("button"));
    expect(focusCenterDock()).toBe(true);
  });
});

// The center's entry must land in the ACTIVE dockview group, so returning to the
// center restores the tab (editor or terminal) you left from — not the first
// visible textarea across a split. With no live DockviewApi, this resolves the
// active group from the DOM (`.dv-active-group`); the live retry/focus path is
// covered by the keyboard-nav integration test.
describe("activeCenterTarget", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  function dockHost(): HTMLElement {
    const body = document.createElement("div");
    body.className = "center-body";
    const host = document.createElement("div");
    host.className = "dock-host";
    host.dataset.active = "true";
    body.appendChild(host);
    document.body.appendChild(body);
    return host;
  }
  function group(host: HTMLElement, active: boolean): HTMLElement {
    const g = document.createElement("div");
    g.className = `dv-groupview${active ? " dv-active-group" : ""}`;
    host.appendChild(g);
    return g;
  }

  it("returns null when there is no active center dock", () => {
    expect(activeCenterTarget()).toBeNull();
  });

  it("targets the active group, not the whole dock-host or a sibling group", () => {
    const host = dockHost();
    const inactive = group(host, false);
    const active = group(host, true);
    inactive.appendChild(document.createElement("textarea")); // a sibling's textarea
    expect(activeCenterTarget()).toBe(active);
  });

  it("falls back to the dock-host when no group is marked active", () => {
    const host = dockHost();
    group(host, false);
    expect(activeCenterTarget()).toBe(host);
  });
});

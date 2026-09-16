import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  _resetPanelFocusRegistryForTests,
  onPanelFocusRequested,
  requestPanelFocus,
} from "./panel-focus-registry";

describe("panel-focus-registry", () => {
  beforeEach(() => _resetPanelFocusRegistryForTests());

  it("notifies only the affected panel's subscribers", () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    onPanelFocusRequested("ws-a", "p1", l1);
    onPanelFocusRequested("ws-a", "p2", l2);
    requestPanelFocus("ws-a", "p1");
    expect(l1).toHaveBeenCalledTimes(1);
    expect(l2).not.toHaveBeenCalled();
  });

  it("notifies every subscriber on repeated requests, not just once", () => {
    const l1 = vi.fn();
    onPanelFocusRequested("ws-a", "p1", l1);
    requestPanelFocus("ws-a", "p1");
    requestPanelFocus("ws-a", "p1");
    expect(l1).toHaveBeenCalledTimes(2);
  });

  it("is a no-op for a panel with no subscribers", () => {
    expect(() => requestPanelFocus("ws-a", "nobody-listening")).not.toThrow();
  });

  it("dispose stops delivery", () => {
    const l1 = vi.fn();
    const sub = onPanelFocusRequested("ws-a", "p1", l1);
    sub.dispose();
    requestPanelFocus("ws-a", "p1");
    expect(l1).not.toHaveBeenCalled();
  });

  // The bug this scoping exists to prevent: a singleton panel's dockview id
  // is the bare kind id (`openSingletonPanel`), so the same panel id is live
  // in every warmed workspace's own dockview instance at once. A tab click in
  // one workspace must not wake the same-named panel in another.
  it("does not notify a same-named panel subscribed from a different workspace", () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    onPanelFocusRequested("ws-a", "output", l1);
    onPanelFocusRequested("ws-b", "output", l2);
    requestPanelFocus("ws-a", "output");
    expect(l1).toHaveBeenCalledTimes(1);
    expect(l2).not.toHaveBeenCalled();
  });
});

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  _resetPanelChromeRegistryForTests,
  clearPanelBreadcrumb,
  getPanelBreadcrumb,
  setPanelBreadcrumb,
  subscribePanelBreadcrumb,
} from "./panel-chrome-registry";

describe("panel-chrome-registry (RFC 0039)", () => {
  beforeEach(() => _resetPanelChromeRegistryForTests());

  it("distinguishes unset (undefined) from explicitly hidden (null)", () => {
    expect(getPanelBreadcrumb("p1")).toBeUndefined();
    setPanelBreadcrumb("p1", null);
    expect(getPanelBreadcrumb("p1")).toBeNull();
  });

  it("stores and returns a crumb, scoped per panel", () => {
    setPanelBreadcrumb("p1", { filePath: "/w/a" });
    expect(getPanelBreadcrumb("p1")).toEqual({ filePath: "/w/a" });
    expect(getPanelBreadcrumb("p2")).toBeUndefined();
  });

  it("notifies only the affected panel's subscribers", () => {
    const l1 = vi.fn();
    const l2 = vi.fn();
    subscribePanelBreadcrumb("p1", l1);
    subscribePanelBreadcrumb("p2", l2);
    setPanelBreadcrumb("p1", { filePath: "/w/a" });
    expect(l1).toHaveBeenCalledTimes(1);
    expect(l2).not.toHaveBeenCalled();
  });

  it("is idempotent for an unchanged crumb — no notify", () => {
    const l1 = vi.fn();
    subscribePanelBreadcrumb("p1", l1);
    setPanelBreadcrumb("p1", { filePath: "/w/a", leafIcon: "folder" });
    setPanelBreadcrumb("p1", { filePath: "/w/a", leafIcon: "folder" });
    expect(l1).toHaveBeenCalledTimes(1);
  });

  it("clearPanelBreadcrumb drops the entry and notifies", () => {
    const l1 = vi.fn();
    subscribePanelBreadcrumb("p1", l1);
    setPanelBreadcrumb("p1", { filePath: "/w/a" });
    clearPanelBreadcrumb("p1");
    expect(getPanelBreadcrumb("p1")).toBeUndefined();
    expect(l1).toHaveBeenCalledTimes(2);
  });

  it("dispose stops delivery", () => {
    const l1 = vi.fn();
    const sub = subscribePanelBreadcrumb("p1", l1);
    sub.dispose();
    setPanelBreadcrumb("p1", { filePath: "/w/a" });
    expect(l1).not.toHaveBeenCalled();
  });
});

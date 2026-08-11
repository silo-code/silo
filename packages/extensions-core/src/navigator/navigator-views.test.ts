import { describe, it, expect, vi } from "vitest";
import type { MenuItem, NavigatorView } from "@silo-code/sdk";
import {
  DEFAULT_VIEW_ID,
  activeViewTitle,
  buildViewMenuItems,
  resolveActiveView,
} from "./navigator-views";

function view(id: string, title = id): NavigatorView {
  return { id, title, component: () => null };
}

const views = [
  view(DEFAULT_VIEW_ID, "Workspaces"),
  view("ext.status", "Agents by status"),
  view("ext.ws", "Agents by workspace"),
];

describe("resolveActiveView", () => {
  it("opens on the workspace list when nothing is saved", () => {
    expect(resolveActiveView(views, undefined)).toBe(DEFAULT_VIEW_ID);
  });

  it("returns the saved view when it is registered", () => {
    expect(resolveActiveView(views, "ext.ws")).toBe("ext.ws");
  });

  it("falls back when the saved view is no longer registered", () => {
    // The extension that owned it was disabled or uninstalled.
    expect(resolveActiveView(views, "gone.view")).toBe(DEFAULT_VIEW_ID);
  });

  it("falls back to the first view when even the default is missing", () => {
    const only = [view("ext.status", "Agents by status")];
    expect(resolveActiveView(only, "gone.view")).toBe("ext.status");
  });

  it("returns undefined when nothing is registered", () => {
    expect(resolveActiveView([], "ext.ws")).toBeUndefined();
  });
});

describe("activeViewTitle", () => {
  it("names the active view", () => {
    expect(activeViewTitle(views, "ext.status")).toBe("Agents by status");
  });

  it("falls back to the panel name for an unknown or absent id", () => {
    expect(activeViewTitle(views, "gone.view")).toBe("Navigator");
    expect(activeViewTitle([], undefined)).toBe("Navigator");
  });
});

describe("buildViewMenuItems", () => {
  const items = (activeId: string | undefined, onPick = () => {}) =>
    buildViewMenuItems(views, activeId, onPick);

  it("leads with a header, then every view in registry order", () => {
    const rows = items(DEFAULT_VIEW_ID);
    expect(rows[0]).toEqual({ type: "header", label: "View" });
    expect(rows.slice(1).map((r) => (r as MenuItem).label)).toEqual([
      "Workspaces",
      "Agents by status",
      "Agents by workspace",
    ]);
  });

  it("checks exactly the active row", () => {
    const checked = items("ext.ws")
      .filter((r): r is MenuItem => "label" in r && Boolean(r.checked))
      .map((r) => r.label);
    expect(checked).toEqual(["Agents by workspace"]);
  });

  it("checks nothing when no view is active", () => {
    const checked = items(undefined).filter(
      (r) => "label" in r && Boolean(r.checked),
    );
    expect(checked).toEqual([]);
  });

  it("passes the picked view's id to onPick", () => {
    const onPick = vi.fn();
    const rows = items(DEFAULT_VIEW_ID, onPick) as MenuItem[];
    rows[2].run?.();
    expect(onPick).toHaveBeenCalledWith("ext.status");
  });
});

import { describe, it, expect } from "vitest";
import type { NavigatorView } from "@silo-code/sdk";
import {
  DEFAULT_VIEW_ID,
  activeViewIndex,
  buildViewRows,
  resolveActiveView,
} from "./navigator-views";

function view(
  id: string,
  title = id,
  icon?: NavigatorView["icon"],
): NavigatorView {
  return { id, title, icon, component: () => null };
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

describe("activeViewIndex", () => {
  it("points at the active row so focus enters on what's on screen", () => {
    expect(activeViewIndex(views, DEFAULT_VIEW_ID)).toBe(0);
    expect(activeViewIndex(views, "ext.ws")).toBe(2);
  });

  // -1 isn't clamped here — the sole caller passes this straight to
  // useFocusGroup's `start`, which already treats a negative index as "park
  // on the first row" (see the doc comment on activeViewIndex).
  it("returns -1 when the active view isn't in the list", () => {
    expect(activeViewIndex(views, "gone.view")).toBe(-1);
    expect(activeViewIndex(views, undefined)).toBe(-1);
  });

  it("returns -1 when nothing is registered", () => {
    expect(activeViewIndex([], undefined)).toBe(-1);
  });
});

describe("buildViewRows", () => {
  it("returns one row per view, in registry order", () => {
    const rows = buildViewRows(views, DEFAULT_VIEW_ID);
    expect(rows.map((r) => r.id)).toEqual([
      DEFAULT_VIEW_ID,
      "ext.status",
      "ext.ws",
    ]);
  });

  it("selects exactly the active row", () => {
    const rows = buildViewRows(views, "ext.ws");
    expect(rows.map((r) => r.selected)).toEqual([false, false, true]);
  });

  it("selects nothing when no view is active", () => {
    const rows = buildViewRows(views, undefined);
    expect(rows.every((r) => !r.selected)).toBe(true);
  });

  it("selects nothing when the active id isn't registered", () => {
    // The extension that owned it was disabled or uninstalled — same case
    // resolveActiveView falls back for; this just confirms the row list
    // doesn't strand a stale checkmark on some other row.
    const rows = buildViewRows(views, "gone.view");
    expect(rows.every((r) => !r.selected)).toBe(true);
  });

  it("passes each view's own title and icon through unchanged", () => {
    // A plain string stands in for a React node here — this file has no JSX,
    // and buildViewRows never inspects the icon, only forwards it.
    const withIcon = view("acme.x", "Acme", "🔧");
    const [row] = buildViewRows([withIcon], undefined);
    expect(row.title).toBe("Acme");
    expect(row.icon).toBe("🔧");
  });
});

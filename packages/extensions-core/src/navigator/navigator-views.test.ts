import { describe, it, expect } from "vitest";
import type { NavigatorView } from "@silo-code/sdk";
import {
  DEFAULT_VIEW_ID,
  activeViewIndex,
  buildViewRows,
  moveViewInOrder,
  reorderSavedViews,
  chromeHostViewId,
  resolveActiveView,
  resolveViewList,
  setViewDisabled,
  toggleIdInList,
} from "./navigator-views";

function view(
  id: string,
  title = id,
  icon?: NavigatorView["icon"],
  order?: number,
): NavigatorView {
  return { id, title, icon, order, component: () => null };
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

describe("resolveViewList", () => {
  const noPrefs = { viewOrder: [], disabledViews: [] };
  const reg = [
    view("b", "Beta", undefined, 2),
    view("a", "Alpha", undefined, 1),
    view("c", "Gamma", undefined, 1),
  ];

  it("sorts unlisted views by order then title with no prefs", () => {
    const { ordered } = resolveViewList(reg, noPrefs);
    // a(1) and c(1) tie on order → title: Alpha before Gamma; then b(2).
    expect(ordered.map((v) => v.id)).toEqual(["a", "c", "b"]);
  });

  it("puts viewOrder ids first, in that order, rest appended by sort", () => {
    const { ordered } = resolveViewList(reg, {
      viewOrder: ["b", "c"],
      disabledViews: [],
    });
    expect(ordered.map((v) => v.id)).toEqual(["b", "c", "a"]);
  });

  it("skips a viewOrder id that isn't registered", () => {
    const { ordered } = resolveViewList(reg, {
      viewOrder: ["gone", "b"],
      disabledViews: [],
    });
    expect(ordered.map((v) => v.id)).toEqual(["b", "a", "c"]);
  });

  it("partitions enabled / disabled by disabledViews", () => {
    const { enabled, disabled } = resolveViewList(reg, {
      viewOrder: [],
      disabledViews: ["a"],
    });
    expect(enabled.map((v) => v.id)).toEqual(["c", "b"]);
    expect(disabled.map((v) => v.id)).toEqual(["a"]);
  });

  it("forces the first view on when disabledViews would empty the list", () => {
    const { enabled } = resolveViewList(reg, {
      viewOrder: ["a", "b", "c"],
      disabledViews: ["a", "b", "c"],
    });
    expect(enabled.map((v) => v.id)).toEqual(["a"]);
  });

  it("returns empty lists when nothing is registered", () => {
    expect(resolveViewList([], noPrefs)).toEqual({
      ordered: [],
      enabled: [],
      disabled: [],
    });
  });
});

describe("moveViewInOrder", () => {
  it("moves an id up", () => {
    expect(moveViewInOrder(["a", "b", "c"], "b", -1)).toEqual(["b", "a", "c"]);
  });

  it("moves an id down", () => {
    expect(moveViewInOrder(["a", "b", "c"], "b", 1)).toEqual(["a", "c", "b"]);
  });

  it("is a no-op at the top edge", () => {
    expect(moveViewInOrder(["a", "b"], "a", -1)).toEqual(["a", "b"]);
  });

  it("is a no-op at the bottom edge", () => {
    expect(moveViewInOrder(["a", "b"], "b", 1)).toEqual(["a", "b"]);
  });

  it("is a no-op when the id isn't present", () => {
    expect(moveViewInOrder(["a", "b"], "x", 1)).toEqual(["a", "b"]);
  });

  it("returns a fresh array (never mutates the input)", () => {
    const input = ["a", "b"];
    moveViewInOrder(input, "a", 1);
    expect(input).toEqual(["a", "b"]);
  });
});

describe("setViewDisabled", () => {
  it("adds an id when disabling", () => {
    expect(setViewDisabled(["a"], "b", true)).toEqual(["a", "b"]);
  });

  it("removes an id when enabling", () => {
    expect(setViewDisabled(["a", "b"], "b", false)).toEqual(["a"]);
  });

  it("is idempotent", () => {
    expect(setViewDisabled(["a"], "a", true)).toEqual(["a"]);
    expect(setViewDisabled(["a"], "b", false)).toEqual(["a"]);
  });
});

describe("reorderSavedViews", () => {
  it("moves a registered view and rewrites the saved order", () => {
    // Nothing saved yet; three registered views displayed a,b,c.
    expect(reorderSavedViews([], ["a", "b", "c"], "c", -1)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("keeps a saved id for a currently-unregistered view in its slot", () => {
    // Saved order a,b,C,d where C's extension is disabled (not displayed).
    // User nudges b down past d.
    const saved = ["a", "b", "C", "d"];
    const displayed = ["a", "b", "d"];
    expect(reorderSavedViews(saved, displayed, "b", 1)).toEqual([
      "a",
      "d",
      "C",
      "b",
    ]);
  });

  it("leaves an unregistered leading id untouched", () => {
    const saved = ["GONE", "a", "b"];
    const displayed = ["a", "b"];
    expect(reorderSavedViews(saved, displayed, "b", -1)).toEqual([
      "GONE",
      "b",
      "a",
    ]);
  });

  it("appends registered ids that were never saved", () => {
    // a is saved; b, c are registered but not yet in viewOrder.
    expect(reorderSavedViews(["a"], ["a", "b", "c"], "c", -1)).toEqual([
      "a",
      "c",
      "b",
    ]);
  });

  it("is a no-op at an edge (still returns a fresh array)", () => {
    const saved = ["a", "b"];
    const out = reorderSavedViews(saved, ["a", "b"], "a", -1);
    expect(out).toEqual(["a", "b"]);
    expect(out).not.toBe(saved);
  });
});

describe("chromeHostViewId", () => {
  it("is the Workspaces view when it's enabled, wherever it sits in order", () => {
    const enabled = [
      view("ext.status", "Agents"),
      view(DEFAULT_VIEW_ID, "Workspaces"),
    ];
    expect(chromeHostViewId(enabled)).toBe(DEFAULT_VIEW_ID);
  });

  it("is null when Workspaces is not enabled — no top-view fallback (ADR 0048)", () => {
    const enabled = [view("ext.status", "Agents"), view("ext.tasks", "Tasks")];
    expect(chromeHostViewId(enabled)).toBeNull();
  });

  it("is null when nothing is enabled", () => {
    expect(chromeHostViewId([])).toBeNull();
  });
});

describe("toggleIdInList", () => {
  it("adds an absent id", () => {
    expect(toggleIdInList(["a"], "b")).toEqual(["a", "b"]);
  });

  it("removes a present id", () => {
    expect(toggleIdInList(["a", "b"], "a")).toEqual(["b"]);
  });

  it("never mutates the input", () => {
    const input = ["a"];
    toggleIdInList(input, "b");
    expect(input).toEqual(["a"]);
  });
});

import { describe, it, expect, vi } from "vitest";
import type { MenuItem, SidePanel } from "@silo-code/sdk";
import { sidePanelTabDisplayItems } from "./side-panel-tab-display-menu";

function panel(id: string, withIcon: boolean): SidePanel {
  return {
    id,
    title: id,
    location: "right",
    component: () => null,
    ...(withIcon ? { icon: "glyph" } : {}),
  };
}

function rowsFor(
  p: SidePanel,
  modes: Record<string, "icon" | "title" | "both"> = {},
  pick = vi.fn(),
) {
  const items = sidePanelTabDisplayItems(p, modes, pick);
  const parent = items[0] as MenuItem | undefined;
  return { items, parent, rows: (parent?.submenu ?? []) as MenuItem[], pick };
}

describe("sidePanelTabDisplayItems", () => {
  it("is one 'Tab Display' submenu parent, not a flat section", () => {
    const { items, parent } = rowsFor(panel("git", true));
    expect(items).toHaveLength(1);
    expect(parent?.label).toBe("Tab Display");
    expect(parent?.run).toBeUndefined();
  });

  it("offers all three modes in a stable order", () => {
    const { rows } = rowsFor(panel("git", true));
    expect(rows.map((r) => r.label)).toEqual([
      "Icon",
      "Title",
      "Icon and Title",
    ]);
  });

  it("checks exactly the effective mode", () => {
    const { rows } = rowsFor(panel("git", true), { git: "both" });
    expect(rows.filter((r) => r.checked).map((r) => r.label)).toEqual([
      "Icon and Title",
    ]);
  });

  it("checks Title when nothing is stored", () => {
    const { rows } = rowsFor(panel("git", true));
    expect(rows.find((r) => r.checked)?.label).toBe("Title");
  });

  it("each row reports its own mode to the picker", () => {
    const { rows, pick } = rowsFor(panel("git", true));
    rows.find((r) => r.label === "Icon")?.run?.();
    expect(pick).toHaveBeenCalledWith("git", "icon");
    rows.find((r) => r.label === "Icon and Title")?.run?.();
    expect(pick).toHaveBeenCalledWith("git", "both");
  });

  it("contributes nothing for a panel with no icon", () => {
    // Only "Title" would be selectable, so the submenu would be a dead end.
    const { items, pick } = rowsFor(panel("tasks", false));
    expect(items).toEqual([]);
    expect(pick).not.toHaveBeenCalled();
  });
});

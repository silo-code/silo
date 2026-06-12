import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Disposable, MenuItem, SidePanel } from "@silo-code/sdk";
import { sidePanelRegistry } from "../extension-host/side-panels";
import { store } from "../state/store";
import { sidePanelVisibilityItems } from "./side-column-helpers";

function panel(
  id: string,
  title: string,
  location: "left" | "right",
): SidePanel {
  return { id, title, location, component: () => null };
}

describe("sidePanelVisibilityItems", () => {
  let subs: Disposable[] = [];

  beforeEach(() => {
    store.sidePanelVisibility = {};
    subs = [
      sidePanelRegistry.register(panel("zed", "Zed", "right")),
      sidePanelRegistry.register(panel("alpha", "Alpha", "left")),
    ];
  });

  afterEach(() => {
    for (const s of subs) s.dispose();
  });

  it("leads with a 'Side Panels' header", () => {
    const items = sidePanelVisibilityItems();
    expect(items[0]).toEqual({ type: "header", label: "Side Panels" });
  });

  it("lists every registered panel sorted by title, checked when visible", () => {
    const rows = sidePanelVisibilityItems().slice(1) as MenuItem[];
    expect(rows.map((r) => r.label)).toEqual(["Alpha", "Zed"]);
    expect(rows.every((r) => r.checked)).toBe(true);
  });

  it("unchecks a hidden panel", () => {
    store.sidePanelVisibility.alpha = false;
    const rows = sidePanelVisibilityItems().slice(1) as MenuItem[];
    const alpha = rows.find((r) => r.label === "Alpha");
    expect(alpha?.checked).toBe(false);
  });

  it("each row's run toggles that panel's visibility", () => {
    const rows = sidePanelVisibilityItems().slice(1) as MenuItem[];
    rows.find((r) => r.label === "Zed")?.run?.();
    expect(store.sidePanelVisibility.zed).toBe(false);
  });
});

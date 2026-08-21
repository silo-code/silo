import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { Disposable, MenuItem, SidePanel } from "@silo-code/sdk";
import { sidePanelRegistry } from "../extension-host/side-panels";
import { store } from "../state/store";
import {
  createGhost,
  moveGhost,
  removeGhost,
  sidePanelVisibilityItems,
} from "./side-column-helpers";

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

describe("the drag ghost", () => {
  /** A tab in a real tab bar, with a stubbed box (jsdom has no layout). */
  function tab(): HTMLElement {
    const bar = document.createElement("div");
    bar.className = "panel-header tabs";
    const button = document.createElement("button");
    button.className = "tab active tab-dragging";
    button.dataset.panelId = "silo.git";
    button.textContent = "Git";
    bar.appendChild(button);
    document.body.appendChild(bar);
    button.getBoundingClientRect = () =>
      ({ left: 100, top: 40, width: 80, height: 32 }) as DOMRect;
    return button;
  }

  afterEach(() => {
    removeGhost();
    document.body.innerHTML = "";
  });

  function ghost(): HTMLElement {
    const el = document.querySelector<HTMLElement>(".side-tab-drag-ghost");
    if (!el) throw new Error("no ghost");
    return el;
  }

  it("carries a copy of the tab, not a stand-in label", () => {
    createGhost(tab(), 120, 50);
    const clone = ghost().querySelector<HTMLElement>(".tab");
    expect(clone?.textContent).toBe("Git");
    // The active state comes along, so the ghost reads as *that* tab.
    expect(clone?.classList.contains("active")).toBe(true);
  });

  it("rebuilds the ancestor the tab's CSS selects through", () => {
    createGhost(tab(), 120, 50);
    expect(ghost().querySelector(".panel-header.tabs .tab")).not.toBeNull();
  });

  it("drops the source's drag styling and its panel id", () => {
    createGhost(tab(), 120, 50);
    const clone = ghost().querySelector<HTMLElement>(".tab");
    // The original fades to show it has been lifted; the ghost must not.
    expect(clone?.classList.contains("tab-dragging")).toBe(false);
    // A duplicate data-panel-id in the document would confuse tab lookups.
    expect(clone?.dataset.panelId).toBeUndefined();
    expect(document.querySelectorAll('[data-panel-id="silo.git"]').length).toBe(
      1,
    );
  });

  it("matches the source tab's box", () => {
    createGhost(tab(), 120, 50);
    expect(ghost().style.width).toBe("80px");
    expect(ghost().style.height).toBe("32px");
  });

  // Picked up, not re-centred: the point the user grabbed stays under the
  // cursor for the whole drag.
  it("keeps the grab point under the cursor", () => {
    createGhost(tab(), 120, 50); // 20px in, 10px down
    expect(ghost().style.left).toBe("100px");
    expect(ghost().style.top).toBe("40px");

    moveGhost(300, 200);
    expect(ghost().style.left).toBe("280px");
    expect(ghost().style.top).toBe("190px");
  });

  it("cleans up after itself", () => {
    createGhost(tab(), 120, 50);
    removeGhost();
    expect(document.querySelector(".side-tab-drag-ghost")).toBeNull();
    expect(document.body.style.cursor).toBe("");
    // A move after removal is a no-op, not a crash.
    expect(() => moveGhost(10, 10)).not.toThrow();
  });
});

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSnapshot } from "valtio";
import { sidePanelRegistry } from "../extension-host/side-panels";
import type { MenuEntry, SidePanel } from "@silo-code/sdk";
import type { SidePanelSlot } from "../state/types";
import {
  store,
  isSidePanelVisible,
  toggleSidePanelVisibility,
} from "../state/store";
import { sideTabDrag } from "./drag-state";
import { resolveSidePanelSlot, slotToLocation } from "./side-panel-slots";
import { dropZoneAt, type DropZone } from "./side-dock-drop";

// ─── slot helpers ──────────────────────────────────────────────────────────

export function topSlot(location: "left" | "right"): SidePanelSlot {
  return location;
}
export function bottomSlot(location: "left" | "right"): SidePanelSlot {
  return `${location}-bottom`;
}
export function isTopSlot(slot: string, location: "left" | "right") {
  return slot === location;
}
export function isTopSlotOfColumn(slot: string): boolean {
  return slot === "left" || slot === "right";
}
// Re-exported so the slot algebra has one home (`side-panel-slots.ts`, pure and
// React-free) while existing importers keep reaching for it here.
export { slotToLocation };

// ─── drag ghost element ──────────────────────────────────────────────────────

let ghostEl: HTMLDivElement | null = null;

export function createGhost(title: string, x: number, y: number) {
  ghostEl = document.createElement("div");
  ghostEl.className = "side-tab-drag-ghost";
  ghostEl.textContent = title;
  ghostEl.style.left = `${x}px`;
  ghostEl.style.top = `${y}px`;
  document.body.appendChild(ghostEl);
  document.body.style.cursor = "grabbing";
}

export function moveGhost(x: number, y: number) {
  if (ghostEl) {
    ghostEl.style.left = `${x}px`;
    ghostEl.style.top = `${y}px`;
  }
}

export function removeGhost() {
  ghostEl?.remove();
  ghostEl = null;
  document.body.style.cursor = "";
}

// ─── drop-target detection ────────────────────────────────────────────────────

/** The pane under the pointer, the dock it belongs to, and which half of it.
 *
 * The dock comes off the element's own `data-location` rather than being parsed
 * out of the pane id: an id is opaque (RFC 0027), so a `startsWith("left")` test
 * would quietly answer "right" for every pane the user creates. */
export function getDropInfo(
  x: number,
  y: number,
): {
  slot: string;
  location: "left" | "right";
  zone: DropZone;
} | null {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const pane = (el as HTMLElement).closest<HTMLElement>("[data-slot]");
  if (!pane) return null;
  const slot = pane.dataset.slot as string;
  const location = pane.dataset.location === "left" ? "left" : "right";
  // Zones are measured against the pane's *body*, not its whole box, so the tab
  // bar isn't a top edge — dragging onto the tabs means "join this pane".
  const body = pane.querySelector<HTMLElement>(".panel-body");
  if (!body) return { slot, location, zone: "center" };
  return {
    slot,
    location,
    zone: dropZoneAt(body.getBoundingClientRect(), x, y),
  };
}

// ─── hooks ───────────────────────────────────────────────────────────────────

export function useRegistryTick() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const sub = sidePanelRegistry.onChange(() => setTick((n) => n + 1));
    return () => sub.dispose();
  }, []);
  return tick;
}

/** The visible panels in one pane, in order. `paneId` is opaque — a legacy slot
 * string today, any pane id once RFC 0027's splits land. */
export function usePanelsForSlot(paneId: string): SidePanel[] {
  const snap = useSnapshot(store);
  const tick = useRegistryTick();
  return useMemo(() => {
    const overrides = snap.sidePanelLocations;
    const order = snap.sidePanelOrder;
    const filtered = sidePanelRegistry.list().filter((p) => {
      if (snap.sidePanelVisibility[p.id] === false) return false;
      // A bottom slot is only ever reached through an override (a panel
      // registers `left`/`right`), so the single comparison covers both
      // segments — and routes an override this build can't render back to the
      // panel's own column instead of dropping it. See `resolveSidePanelSlot`.
      return resolveSidePanelSlot(overrides[p.id], p.location) === paneId;
    });
    filtered.sort(
      (a, b) => (order[a.id] ?? a.order ?? 0) - (order[b.id] ?? b.order ?? 0),
    );
    return filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    paneId,
    tick,
    snap.sidePanelLocations,
    snap.sidePanelOrder,
    snap.sidePanelVisibility,
  ]);
}

export function useSideTabDrag() {
  return useSyncExternalStore(sideTabDrag.subscribe, sideTabDrag.get);
}

// ─── side-panel visibility menu ───────────────────────────────────────────────

/**
 * Menu entries (a "Side Panels" header + one checkable row per registered panel,
 * sorted by title) for toggling each side panel's visibility. Shared by the tab
 * bar and the empty-column context menus so a fully-hidden dock can still be
 * re-populated. Read at open time, so checkmarks reflect the live state.
 */
export function sidePanelVisibilityItems(): MenuEntry[] {
  const items: MenuEntry[] = [{ type: "header", label: "Side Panels" }];
  for (const sp of [...sidePanelRegistry.list()].sort((a, b) =>
    a.title.localeCompare(b.title),
  )) {
    items.push({
      label: sp.title,
      checked: isSidePanelVisible(sp.id),
      run: () => toggleSidePanelVisibility(sp.id),
    });
  }
  return items;
}

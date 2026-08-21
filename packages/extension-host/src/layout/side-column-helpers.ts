import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSnapshot } from "valtio";
import { sidePanelRegistry } from "../extension-host/side-panels";
import type { MenuEntry, SidePanel } from "@silo-code/sdk";
import type { SideDockTrees } from "../state/side-dock-tree";
import {
  store,
  isSidePanelVisible,
  toggleSidePanelVisibility,
} from "../state/store";
import { sideTabDrag } from "./drag-state";
import { resolvePaneId } from "../state/side-dock-tree";
import { dropZoneAt, type DropZone } from "./side-dock-drop";

// ─── drag ghost element ──────────────────────────────────────────────────────

let ghostEl: HTMLDivElement | null = null;
/** Where inside the tab the pointer went down — the ghost keeps that spot under
 * the cursor, so the tab feels picked up rather than re-centred on it. */
let grabOffsetX = 0;
let grabOffsetY = 0;

/**
 * Build the thing that follows the cursor: a **clone of the tab itself**, at
 * the tab's own size.
 *
 * The clone is wrapped in a `panel-header tabs` element because that is the
 * ancestor the tab's CSS selects through (`.panel-header.tabs .tab`). Rebuilding
 * the chain rather than restyling the clone means the ghost is drawn by exactly
 * the rules the real tab uses — including its active underline — and stays
 * right when those rules change.
 */
export function createGhost(source: HTMLElement, x: number, y: number) {
  const rect = source.getBoundingClientRect();
  grabOffsetX = x - rect.left;
  grabOffsetY = y - rect.top;

  const clone = source.cloneNode(true) as HTMLElement;
  clone.classList.remove("tab-dragging");
  clone.removeAttribute("data-panel-id");

  const bar = document.createElement("div");
  bar.className = "panel-header tabs";
  bar.appendChild(clone);

  ghostEl = document.createElement("div");
  ghostEl.className = "side-tab-drag-ghost";
  ghostEl.style.width = `${rect.width}px`;
  ghostEl.style.height = `${rect.height}px`;
  // Each dock sets its own panel font size on `.side-pane`, an ancestor the
  // ghost doesn't have (it hangs off <body> to escape the dock's overflow
  // clipping). Copy the resolved value so the clone measures the same.
  ghostEl.style.fontSize = getComputedStyle(source).fontSize;
  ghostEl.appendChild(bar);

  document.body.appendChild(ghostEl);
  moveGhost(x, y);
  document.body.style.cursor = "grabbing";
}

export function moveGhost(x: number, y: number) {
  if (ghostEl) {
    ghostEl.style.left = `${x - grabOffsetX}px`;
    ghostEl.style.top = `${y - grabOffsetY}px`;
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
    const trees = snap.sideDockTrees as SideDockTrees;
    const filtered = sidePanelRegistry.list().filter((p) => {
      if (snap.sidePanelVisibility[p.id] === false) return false;
      // Resolved against the live tree, so a panel dropped into a pane a split
      // just minted lands there — and one whose pane has since been retired
      // falls back to its own dock rather than vanishing. See `resolvePaneId`.
      return resolvePaneId(trees, overrides[p.id], p.location) === paneId;
    });
    filtered.sort(
      (a, b) => (order[a.id] ?? a.order ?? 0) - (order[b.id] ?? b.order ?? 0),
    );
    return filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    paneId,
    tick,
    snap.sideDockTrees,
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

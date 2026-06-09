import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useSnapshot } from "valtio";
import { sidePanelRegistry } from "../extension-host/side-panels";
import type { SidePanel } from "@silo-code/sdk";
import type { SidePanelSlot } from "../state/types";
import { store } from "../state/store";
import { sideTabDrag } from "./drag-state";

// ─── slot helpers ──────────────────────────────────────────────────────────

export function topSlot(location: "left" | "right"): SidePanelSlot {
  return location;
}
export function bottomSlot(location: "left" | "right"): SidePanelSlot {
  return `${location}-bottom`;
}
export function isTopSlot(slot: SidePanelSlot, location: "left" | "right") {
  return slot === location;
}
export function slotToLocation(slot: SidePanelSlot): "left" | "right" {
  return slot.startsWith("left") ? "left" : "right";
}
export function isTopSlotOfColumn(slot: SidePanelSlot): boolean {
  return slot === "left" || slot === "right";
}

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

export function getDropInfo(
  x: number,
  y: number,
): { slot: SidePanelSlot; zone: "top" | "bottom" } | null {
  const el = document.elementFromPoint(x, y);
  if (!el) return null;
  const pane = (el as HTMLElement).closest<HTMLElement>("[data-slot]");
  if (!pane) return null;
  const slot = pane.dataset.slot as SidePanelSlot;
  const body = pane.querySelector<HTMLElement>(".panel-body");
  let zone: "top" | "bottom" = "top";
  if (body) {
    const rect = body.getBoundingClientRect();
    if (y > rect.top + rect.height / 2) zone = "bottom";
  }
  return { slot, zone };
}

// ─── hooks ───────────────────────────────────────────────────────────────────

function useRegistryTick() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const sub = sidePanelRegistry.onChange(() => setTick((n) => n + 1));
    return () => sub.dispose();
  }, []);
  return tick;
}

export function usePanelsForSlot(slot: SidePanelSlot): SidePanel[] {
  const snap = useSnapshot(store);
  const tick = useRegistryTick();
  return useMemo(() => {
    const overrides = snap.sidePanelLocations;
    const order = snap.sidePanelOrder;
    const isBottom = slot === "left-bottom" || slot === "right-bottom";
    const filtered = sidePanelRegistry.list().filter((p) => {
      const effective = overrides[p.id] ?? p.location;
      if (isBottom) {
        return overrides[p.id] === slot;
      }
      return effective === slot;
    });
    filtered.sort(
      (a, b) => (order[a.id] ?? a.order ?? 0) - (order[b.id] ?? b.order ?? 0),
    );
    return filtered;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot, tick, snap.sidePanelLocations, snap.sidePanelOrder]);
}

export function useSideTabDrag() {
  return useSyncExternalStore(sideTabDrag.subscribe, sideTabDrag.get);
}

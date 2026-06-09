import { subscribe, snapshot } from "valtio";
import { store, toggleLeftPanel, toggleRightPanel } from "../state/store";
import type { LayoutState, LayoutService } from "@silo-code/sdk";

// `ctx.layout` — side-column collapse state. The public contract lives in
// @silo-code/sdk (layout-service.ts); this is the host implementation.

let cachedSnapshot: LayoutState | null = null;

function buildSnapshot(): LayoutState {
  const s = snapshot(store);
  // Early return cached snapshot if nothing changed (prevents infinite loop
  // in useSyncExternalStore, which calls getState on every render).
  if (
    cachedSnapshot &&
    cachedSnapshot.left.collapsed === s.leftPanelCollapsed &&
    cachedSnapshot.right.collapsed === s.rightPanelCollapsed
  ) {
    return cachedSnapshot;
  }
  const next = Object.freeze({
    left: Object.freeze({ collapsed: s.leftPanelCollapsed }),
    right: Object.freeze({ collapsed: s.rightPanelCollapsed }),
  });
  cachedSnapshot = next;
  return next;
}

let service: LayoutService | null = null;

/** @internal — host factory; extensions receive this as `ctx.layout`. */
export function getLayoutService(): LayoutService {
  if (service) return service;
  service = {
    getState: buildSnapshot,
    subscribe(listener) {
      const unsub = subscribe(store, () => listener(buildSnapshot()));
      return { dispose: unsub };
    },
    toggleSidePanel(location) {
      if (location === "left") toggleLeftPanel();
      else toggleRightPanel();
    },
    setSidePanelCollapsed(location, collapsed) {
      if (location === "left") store.leftPanelCollapsed = collapsed;
      else store.rightPanelCollapsed = collapsed;
    },
  };
  return service;
}

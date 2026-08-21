import { subscribe, snapshot } from "valtio";
import {
  store,
  toggleLeftPanel,
  toggleRightPanel,
  setLeftPanelCollapsed,
  setRightPanelCollapsed,
} from "../state/store";
import { sidePanelRegistry } from "./side-panels";
import { activateSidePaneTab } from "../layout/side-pane-registry";
import { dockOfPane, resolvePaneId } from "../state/side-dock-tree";
import { getActiveDockApi } from "../docked/dock-api-registry";
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
      if (location === "left") setLeftPanelCollapsed(collapsed);
      else setRightPanelCollapsed(collapsed);
    },
    openPanel(kindId, params, options) {
      const api = getActiveDockApi();
      if (!api) return;
      if (options?.singleton) {
        const existing = api.getPanel(kindId);
        if (existing) {
          existing.api.setActive();
          return;
        }
      }
      const id = options?.singleton
        ? kindId
        : `${kindId}:${crypto.randomUUID()}`;
      const title = (params?.title as string | undefined) ?? kindId;
      const panel = api.addPanel({ id, component: kindId, title, params });
      panel.api.setActive();
    },
    openSingletonPanel(kindId, params) {
      return service!.openPanel(kindId, params, { singleton: true });
    },
    revealSidePanel(id) {
      const panel = sidePanelRegistry.get(id);
      if (!panel) return;
      // The panel's effective slot — a user may have dragged it to another
      // column/segment; fall back to its registered location.
      const slot = resolvePaneId(
        store.sideDockTrees,
        store.sidePanelLocations[id],
        panel.location,
      );
      const location = dockOfPane(store.sideDockTrees, slot) ?? panel.location;
      // Un-hide it (visibility defaults to visible; `false` means hidden).
      if (store.sidePanelVisibility[id] === false) {
        delete store.sidePanelVisibility[id];
      }
      // Select it as the active tab in its slot. Persisting this is what makes a
      // freshly-shown pane pick it on mount; activateSidePaneTab switches it
      // immediately when the pane is already live.
      store.activeSidePanelTabs[slot] = id;
      activateSidePaneTab(slot, id);
      // Expand the column so it's actually on screen.
      if (location === "left") setLeftPanelCollapsed(false);
      else setRightPanelCollapsed(false);
    },
  };
  return service;
}

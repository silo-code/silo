import type { ActivePanelInfo, PanelService } from "@silo-code/sdk";
import { workspaceIdForPanelRecord } from "../state/workspaces";
import {
  getActiveDockPanel,
  subscribeActiveDockPanel,
} from "./active-dock-panel-registry";
import { classifyPanelKind, parseRecordedPanelId } from "./dock-panel-kinds";
import { focusDockPanel } from "./focus-dock-panel";
import { tabAdornmentMethodsFor } from "./tab-adornment-registry";

// ── Reactive active-panel state ─────────────────────────────────────────────
// Derived from the shared active-dock-panel fact (RFC 0064), filtered to the
// "panel" kind — the same isolation the adornment methods below already
// enforce. Mirrors editor-service.ts's buildEditorsState/notify pattern:
// cache the last computed value so referentially-unchanged ticks (the
// registry fires on every active-panel change, including editor<->editor and
// terminal<->terminal switches this service doesn't care about) don't spuriously
// notify subscribers.

let cachedActivePanel: ActivePanelInfo | null = null;

function buildActivePanelInfo(): ActivePanelInfo | null {
  const active = getActiveDockPanel();
  const classified = active && classifyPanelKind(active.panelId);
  if (!active || !classified || active.workspaceId === null) {
    if (cachedActivePanel !== null) cachedActivePanel = null;
    return cachedActivePanel;
  }
  if (
    cachedActivePanel &&
    cachedActivePanel.panelId === active.panelId &&
    cachedActivePanel.workspaceId === active.workspaceId
  ) {
    return cachedActivePanel;
  }
  cachedActivePanel = {
    panelId: active.panelId,
    kindId: classified.kindId,
    workspaceId: active.workspaceId,
    recordId: classified.recordId,
  };
  return cachedActivePanel;
}

const panelStateListeners = new Set<(s: ActivePanelInfo | null) => void>();

function notifyPanelListeners(): void {
  const prev = cachedActivePanel;
  const next = buildActivePanelInfo();
  if (next === prev) return;
  for (const l of panelStateListeners) l(next);
}

subscribeActiveDockPanel(notifyPanelListeners);

let service: PanelService | null = null;

/** @internal — host factory; extensions receive this as `ctx.panels`. */
export function getPanelService(): PanelService {
  if (service) return service;
  service = {
    ...tabAdornmentMethodsFor("panel"),
    focus(panelId) {
      const parsed = parseRecordedPanelId(panelId);
      const wsId = parsed && workspaceIdForPanelRecord(parsed.recordId);
      if (!wsId) return;
      focusDockPanel(wsId, panelId);
    },
    getState() {
      return buildActivePanelInfo();
    },
    subscribe(listener) {
      panelStateListeners.add(listener);
      return {
        dispose() {
          panelStateListeners.delete(listener);
        },
      };
    },
  };
  return service;
}

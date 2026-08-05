// The one mapping between a workspace's panel state and the live store.
//
// Two callers need it and used to carry a copy each: switching workspaces
// (`workspaces.ts`, which swaps the live fields) and saving to disk
// (`persistence.ts`, which merges them onto the record). Two hand-kept copies
// of the same field list drift — so both now come through `capturePanelState`
// / `applyPanelState`, and adding a per-workspace field means editing the
// shape in `types.ts` (which both `AppState` and `WorkspaceInternal` derive
// from) and the two functions here. Nothing else.
//
// Everything is copied on the way through: the record must never alias the
// live store's containers, or a later edit to a panel's state would silently
// rewrite the workspace we last saved.

import { store, collapseStateByMode } from "./store";
import { DEFAULT_SMALL_SCREEN_COLLAPSE } from "./types";
import type { PanelStateSnapshot, WorkspaceInternal } from "./types";

/** Deep-clone the two-level extension-state bag (the one field that isn't flat). */
function cloneExtensionState(
  src: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const k of Object.keys(src)) out[k] = { ...src[k] };
  return out;
}

/**
 * The live panel state, in the shape a workspace record stores it.
 *
 * The collapse fields are the one place the two shapes differ: the store holds
 * the *live* pair plus the parked one, keyed by which layout mode is on screen,
 * while a record holds one pair per mode (see `collapseStateByMode` and
 * `extension-host/small-screen-mode.ts`).
 */
export function capturePanelState(): PanelStateSnapshot {
  const collapse = collapseStateByMode();
  return {
    sidePanelLocations: { ...store.sidePanelLocations },
    sidePanelOrder: { ...store.sidePanelOrder },
    activeSidePanelTabs: { ...store.activeSidePanelTabs },
    sidePanelScrollPositions: { ...store.sidePanelScrollPositions },
    sidePanelVisibility: { ...store.sidePanelVisibility },
    extensionState: cloneExtensionState(store.extensionState),
    leftPanelCollapsed: collapse.normal.left,
    rightPanelCollapsed: collapse.normal.right,
    // Absent, not null, while this workspace has never been narrow — that's
    // what keeps the record merge a plain spread.
    ...(collapse.smallScreen
      ? { smallScreenCollapsed: { ...collapse.smallScreen } }
      : {}),
  };
}

/**
 * The reverse: make `ws`'s panel state the live one. Fields absent from an
 * older record fall back to empty.
 *
 * Which layout mode becomes live depends on the window: on a narrow one the
 * workspace's small-screen layout is on screen and its normal-width layout
 * waits in `inactiveModeCollapsed`, and vice versa. A workspace that has never
 * been narrow has no small-screen layout yet, so small-screen mode's default
 * (both collapsed) stands in — which is what it would have done to this
 * workspace on arrival anyway.
 */
export function applyPanelState(ws: WorkspaceInternal): void {
  store.sidePanelLocations = { ...(ws.sidePanelLocations ?? {}) };
  store.sidePanelOrder = { ...(ws.sidePanelOrder ?? {}) };
  store.activeSidePanelTabs = { ...(ws.activeSidePanelTabs ?? {}) };
  store.sidePanelScrollPositions = { ...(ws.sidePanelScrollPositions ?? {}) };
  store.sidePanelVisibility = { ...(ws.sidePanelVisibility ?? {}) };
  store.extensionState = cloneExtensionState(ws.extensionState ?? {});

  const normal = {
    left: ws.leftPanelCollapsed ?? false,
    right: ws.rightPanelCollapsed ?? false,
  };
  const smallScreen = ws.smallScreenCollapsed
    ? { ...ws.smallScreenCollapsed }
    : null;
  const live = store.smallScreenActive
    ? (smallScreen ?? { ...DEFAULT_SMALL_SCREEN_COLLAPSE })
    : normal;
  store.leftPanelCollapsed = live.left;
  store.rightPanelCollapsed = live.right;
  store.inactiveModeCollapsed = store.smallScreenActive ? normal : smallScreen;
}

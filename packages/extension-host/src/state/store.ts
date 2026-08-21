import { proxy } from "valtio";
import {
  readColumnWidths,
  writeColumnWidths,
  type ColumnWidths,
} from "./column-widths";
import {
  dockOfPane,
  insertPane,
  pruneUnreferenced,
  setSizes,
  type InsertSide,
} from "./side-dock-tree";
import type { AppState, SideCollapseState } from "./types";
import {
  DEFAULT_UI_FONT_SIZE,
  MIN_UI_FONT_SIZE,
  MAX_UI_FONT_SIZE,
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_TERMINAL_SETTINGS,
  DEFAULT_PANEL_STATE,
  DEFAULT_SMALL_SCREEN_THRESHOLD_PX,
  MIN_SMALL_SCREEN_THRESHOLD_PX,
  DEFAULT_SMALL_SCREEN_PEEK_WIDTH_PX,
  MIN_SMALL_SCREEN_PEEK_WIDTH_PX,
  MAX_SMALL_SCREEN_PEEK_WIDTH_PX,
  DEFAULT_GLOBAL_PANEL_LAYOUT,
  DEFAULT_SHARED_COLUMN_WIDTHS,
} from "./types";
import type { SideLocation } from "@silo-code/sdk";

export const store = proxy<AppState>({
  workspaces: {},
  workspaceOrder: [],
  activeWorkspaceId: null,
  hydrated: false,
  extensionsReady: false,
  uiFontSize: DEFAULT_UI_FONT_SIZE,
  activeThemeId: "dark",
  editorSettings: { ...DEFAULT_EDITOR_SETTINGS },
  terminalSettings: { ...DEFAULT_TERMINAL_SETTINGS },
  customThemes: [],
  // Every per-workspace panel field, from its one declaration — a new one
  // needs no edit here (see `SharedPanelState` in types.ts).
  ...structuredClone(DEFAULT_PANEL_STATE),
  globalExtensionState: {},
  agentState: {},
  leftPanelCollapsed: false,
  rightPanelCollapsed: false,
  smallScreenModeEnabled: true,
  smallScreenThresholdPx: DEFAULT_SMALL_SCREEN_THRESHOLD_PX,
  smallScreenActive: false,
  inactiveModeCollapsed: null,
  leftPanelPeeking: false,
  rightPanelPeeking: false,
  leftPanelPeekDragging: false,
  rightPanelPeekDragging: false,
  smallScreenPeekWidthLeftPx: DEFAULT_SMALL_SCREEN_PEEK_WIDTH_PX,
  smallScreenPeekWidthRightPx: DEFAULT_SMALL_SCREEN_PEEK_WIDTH_PX,
  // Read synchronously so the first paint has the right columns — the app-state
  // index loads from disk asynchronously, and painting defaults first would
  // make the columns visibly jump. See `column-widths.ts`.
  columnWidths: readColumnWidths(),
  sharedColumnWidthsEnabled: DEFAULT_SHARED_COLUMN_WIDTHS,
  globalPanelLayoutEnabled: false,
  globalActiveTabEnabled: false,
  globalPanelLayout: structuredClone(DEFAULT_GLOBAL_PANEL_LAYOUT),
  globalActiveSidePanelTabs: {},
  groups: {},
  panelOrder: [],
});

/**
 * Record the sizes a resize-handle drag produced for one split in a dock's
 * tree (RFC 0027). `path` is the index route from the dock's root to that
 * split — see `layout/SideColumn.tsx`.
 *
 * This replaces react-resizable-panels' `autoSaveId`, which kept the one split's
 * percentages in a single global localStorage key: not per workspace and not per
 * layout mode, so a stint at a narrow window silently re-proportioned the
 * normal-width dock.
 */
export function setSideDockSizes(
  location: "left" | "right",
  path: readonly number[],
  anchors: readonly string[],
  sizes: number[],
) {
  const next = setSizes(store.sideDockTrees[location], path, anchors, sizes);
  if (next !== store.sideDockTrees[location]) {
    store.sideDockTrees[location] = next;
  }
}

let paneSeq = 0;

/**
 * Split `targetPaneId` and return the id of the pane created on `side`, or
 * `null` when the target isn't in either dock.
 *
 * The caller then places a panel in the new pane — a pane nothing is placed in
 * is pruned right back out by {@link setSidePanelSlot}, so the two steps belong
 * together.
 */
export function splitSideDock(
  targetPaneId: string,
  side: InsertSide,
): string | null {
  const location = dockOfPane(store.sideDockTrees, targetPaneId);
  if (location === null) return null;
  const newPaneId = `pane_${Date.now().toString(36)}_${paneSeq++}`;
  store.sideDockTrees[location] = insertPane(
    store.sideDockTrees[location],
    targetPaneId,
    newPaneId,
    side,
  );
  return newPaneId;
}

/** Drop panes nothing is placed in from both docks — see `pruneUnreferenced`. */
function pruneSideDocks() {
  const referenced = new Set(Object.values(store.sidePanelLocations));
  for (const location of ["left", "right"] as const) {
    const next = pruneUnreferenced(store.sideDockTrees[location], referenced);
    if (next !== store.sideDockTrees[location]) {
      store.sideDockTrees[location] = next;
    }
  }
}

/** Place a side panel in a pane, or clear the override so it falls back to the
 * dock it registered with. `paneId` is opaque — see `SharedPanelState`. */
/**
 * Record the widths a column drag produced, for whichever layout mode is on
 * screen.
 *
 * The localStorage copy is always written, in both sharing modes: it is what
 * the *next launch's first paint* uses, before the index or any workspace has
 * loaded. That keeps first paint correct without it having to know which
 * workspace is about to be restored or whether widths are shared — it simply
 * repaints what was last on screen.
 */
export function setColumnWidths(
  mode: "normal" | "smallScreen",
  widths: ColumnWidths,
) {
  store.columnWidths[mode] = { ...widths };
  writeColumnWidths({
    normal: { ...store.columnWidths.normal },
    smallScreen: { ...store.columnWidths.smallScreen },
  });
}

export function setSidePanelSlot(panelId: string, paneId: string | null) {
  if (paneId === null) {
    delete store.sidePanelLocations[panelId];
  } else {
    store.sidePanelLocations[panelId] = paneId;
  }
  // Moving the last panel out of a pane is what retires that pane.
  pruneSideDocks();
}

/** Convenience alias kept for existing callers. */
export function setSidePanelLocation(
  panelId: string,
  location: "left" | "right" | null,
) {
  setSidePanelSlot(panelId, location);
}

/**
 * Persist an explicit sort order for a set of panels in a slot.
 * Pass the panel ids in desired display order; indices are written to store.
 */
export function reorderSidePanels(orderedIds: string[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    store.sidePanelOrder[orderedIds[i]] = i;
  }
}

/**
 * Collapse setters for the manual/public path (commands, the status bar,
 * `ctx.layout`). They write the *live* layout mode's state — on a narrow
 * window that's small-screen mode's own layout, which is remembered for the
 * next narrow window rather than folded into the normal-width one (see
 * `small-screen-mode.ts`).
 */
export function setLeftPanelCollapsed(collapsed: boolean) {
  store.leftPanelCollapsed = collapsed;
}

export function setRightPanelCollapsed(collapsed: boolean) {
  store.rightPanelCollapsed = collapsed;
}

export function toggleLeftPanel() {
  setLeftPanelCollapsed(!store.leftPanelCollapsed);
}

export function toggleRightPanel() {
  setRightPanelCollapsed(!store.rightPanelCollapsed);
}

/** The live (on-screen) collapse pair, as one value. */
export function liveCollapseState(): SideCollapseState {
  return { left: store.leftPanelCollapsed, right: store.rightPanelCollapsed };
}

/**
 * Both layout modes' collapse state, sorted into the slots a workspace record
 * stores them in. Which one is live depends on `smallScreenActive`, so every
 * writer (workspace switch, persist) goes through this rather than reading the
 * live fields and guessing.
 */
export function collapseStateByMode(): {
  normal: SideCollapseState;
  smallScreen: SideCollapseState | null;
} {
  const live = liveCollapseState();
  return store.smallScreenActive
    ? { normal: store.inactiveModeCollapsed ?? live, smallScreen: live }
    : { normal: live, smallScreen: store.inactiveModeCollapsed };
}

/**
 * Swap the live layout mode with the inactive one — the single move that both
 * entering and leaving small-screen mode are made of. `fallback` is the layout
 * to switch *to* when the mode being entered has nothing recorded yet.
 */
export function swapCollapseMode(fallback: SideCollapseState): void {
  const incoming = store.inactiveModeCollapsed ?? fallback;
  store.inactiveModeCollapsed = liveCollapseState();
  store.leftPanelCollapsed = incoming.left;
  store.rightPanelCollapsed = incoming.right;
}

export function setSmallScreenModeEnabled(enabled: boolean) {
  store.smallScreenModeEnabled = enabled;
}

export function setSmallScreenThresholdPx(px: number) {
  store.smallScreenThresholdPx = Math.max(
    MIN_SMALL_SCREEN_THRESHOLD_PX,
    Math.round(px),
  );
}

/** Set the peek overlay's width for one side — global (not per-workspace) and
 * independent of either layout mode's column width. Clamped to a sane, usable
 * range regardless of caller (a drag gesture or a future settings-page field). */
export function setSmallScreenPeekWidthPx(side: SideLocation, px: number) {
  const clamped = Math.max(
    MIN_SMALL_SCREEN_PEEK_WIDTH_PX,
    Math.min(MAX_SMALL_SCREEN_PEEK_WIDTH_PX, Math.round(px)),
  );
  if (side === "left") store.smallScreenPeekWidthLeftPx = clamped;
  else store.smallScreenPeekWidthRightPx = clamped;
}

/** Whether a side panel is shown in the dock. Absent = visible (default). */
export function isSidePanelVisible(panelId: string): boolean {
  return store.sidePanelVisibility[panelId] !== false;
}

/** Flip a side panel between shown and hidden. Hiding stores an explicit
 * `false`; showing deletes the key, returning it to the default-visible state. */
export function toggleSidePanelVisibility(panelId: string) {
  if (store.sidePanelVisibility[panelId] === false) {
    delete store.sidePanelVisibility[panelId];
  } else {
    store.sidePanelVisibility[panelId] = false;
  }
}

export function setTheme(id: string) {
  store.activeThemeId = id;
}

export function toggleTheme() {
  store.activeThemeId = store.activeThemeId === "dark" ? "light" : "dark";
}

/** Called by main.tsx after loadInstalled() resolves so the dock can proceed with fromJSON. */
export function setExtensionsReady() {
  store.extensionsReady = true;
}

export function setUiFontSize(size: number) {
  const clamped = Math.max(
    MIN_UI_FONT_SIZE,
    Math.min(MAX_UI_FONT_SIZE, Math.round(size)),
  );
  store.uiFontSize = clamped;
}

export function bumpUiFontSize(delta: number) {
  setUiFontSize(store.uiFontSize + delta);
}

export function resetUiFontSize() {
  setUiFontSize(DEFAULT_UI_FONT_SIZE);
}

export function getActiveWorkspace() {
  const id = store.activeWorkspaceId;
  if (!id) return null;
  return store.workspaces[id] ?? null;
}

import { proxy } from "valtio";
import type { AppState, SidePanelSlot } from "./types";
import {
  DEFAULT_UI_FONT_SIZE,
  MIN_UI_FONT_SIZE,
  MAX_UI_FONT_SIZE,
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_TERMINAL_SETTINGS,
  DEFAULT_SMALL_SCREEN_THRESHOLD_PX,
  MIN_SMALL_SCREEN_THRESHOLD_PX,
  DEFAULT_SMALL_SCREEN_PEEK_WIDTH_PX,
  MIN_SMALL_SCREEN_PEEK_WIDTH_PX,
  MAX_SMALL_SCREEN_PEEK_WIDTH_PX,
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
  sidePanelLocations: {},
  sidePanelOrder: {},
  activeSidePanelTabs: {},
  sidePanelScrollPositions: {},
  extensionState: {},
  globalExtensionState: {},
  leftPanelCollapsed: false,
  rightPanelCollapsed: false,
  smallScreenModeEnabled: true,
  smallScreenThresholdPx: DEFAULT_SMALL_SCREEN_THRESHOLD_PX,
  leftPanelAutoHidden: false,
  rightPanelAutoHidden: false,
  leftPanelPeeking: false,
  rightPanelPeeking: false,
  leftPanelPeekDragging: false,
  rightPanelPeekDragging: false,
  smallScreenPeekWidthLeftPx: DEFAULT_SMALL_SCREEN_PEEK_WIDTH_PX,
  smallScreenPeekWidthRightPx: DEFAULT_SMALL_SCREEN_PEEK_WIDTH_PX,
  sidePanelVisibility: {},
  groups: {},
  panelOrder: [],
});

export function setSidePanelSlot(panelId: string, slot: SidePanelSlot | null) {
  if (slot === null) {
    delete store.sidePanelLocations[panelId];
  } else {
    store.sidePanelLocations[panelId] = slot;
  }
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
 * Explicit collapse setters for the manual/public path (commands, the status
 * bar, `ctx.layout`). Always clear the corresponding `*PanelAutoHidden` flag —
 * an explicit call is by definition not small-screen mode's doing, so it
 * "promotes" the panel to a manual state that auto-hide/auto-restore leaves
 * alone until the next full large→small→large round-trip. Small-screen mode
 * itself (`small-screen-mode.ts`) bypasses these and mutates the collapsed +
 * autoHidden fields together directly.
 */
export function setLeftPanelCollapsed(collapsed: boolean) {
  store.leftPanelCollapsed = collapsed;
  store.leftPanelAutoHidden = false;
}

export function setRightPanelCollapsed(collapsed: boolean) {
  store.rightPanelCollapsed = collapsed;
  store.rightPanelAutoHidden = false;
}

export function toggleLeftPanel() {
  setLeftPanelCollapsed(!store.leftPanelCollapsed);
}

export function toggleRightPanel() {
  setRightPanelCollapsed(!store.rightPanelCollapsed);
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

/** Set the small-screen peek overlay's width for one side — global (not
 * per-workspace) and independent of the panel's normal (large-screen) width.
 * Clamped to a sane, usable range regardless of caller (a drag gesture or a
 * future settings-page field). */
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

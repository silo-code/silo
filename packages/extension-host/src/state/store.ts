import { proxy } from "valtio";
import type { AppState, SidePanelSlot } from "./types";
import {
  DEFAULT_UI_FONT_SIZE,
  MIN_UI_FONT_SIZE,
  MAX_UI_FONT_SIZE,
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_TERMINAL_SETTINGS,
} from "./types";

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
  sidePanelVisibility: {},
  sections: {},
  sectionOrder: [],
  workspaceSections: {},
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

export function toggleLeftPanel() {
  store.leftPanelCollapsed = !store.leftPanelCollapsed;
}

export function toggleRightPanel() {
  store.rightPanelCollapsed = !store.rightPanelCollapsed;
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

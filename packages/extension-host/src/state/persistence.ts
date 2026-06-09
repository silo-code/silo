import { load, Store } from "@tauri-apps/plugin-store";
import { subscribe } from "valtio";
import { store } from "./store";
import {
  DEFAULT_UI_FONT_SIZE,
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_TERMINAL_SETTINGS,
} from "./types";
import type {
  EditorSettings,
  TerminalSettings,
  SidePanelSlot,
  Workspace,
} from "./types";
import { loadPanelStateFromWorkspace } from "./workspaces";

const STORE_FILE = "app-state.json";

interface Persisted {
  workspaces: Record<string, Workspace>;
  workspaceOrder: string[];
  activeWorkspaceId: string | null;
  uiFontSize?: number;
  activeThemeId?: string;
  editorSettings?: Partial<EditorSettings>;
  terminalSettings?: Partial<TerminalSettings>;
  sidePanelLocations?: Record<string, SidePanelSlot>;
  sidePanelOrder?: Record<string, number>;
  activeSidePanelTabs?: Record<string, string>;
  sidePanelScrollPositions?: Record<string, number>;
  extensionState?: Record<string, Record<string, unknown>>;
}

let backing: Store | null = null;
let saveTimer: number | null = null;
const SAVE_DEBOUNCE_MS = 250;

async function getStore(): Promise<Store> {
  if (!backing) backing = await load(STORE_FILE);
  return backing;
}

export async function hydrate(): Promise<void> {
  const s = await getStore();
  const data = (await s.get<Persisted>("state")) ?? null;
  if (data) {
    store.workspaces = data.workspaces ?? {};
    // Legacy diff tabs lived in a separate `ws.diffs` array (a `DiffRecord`
    // type); diffs are now editor records with `mode: "diff"` in `ws.editors`.
    // We don't migrate old `ws.diffs` — diffs are transient views (content is
    // recomputed by the provider), so any open at upgrade time is simply dropped
    // and reopened on demand. The stale field is ignored by the new type.
    store.workspaceOrder = data.workspaceOrder ?? Object.keys(store.workspaces);
    store.activeWorkspaceId = data.activeWorkspaceId ?? null;
    store.uiFontSize = data.uiFontSize ?? DEFAULT_UI_FONT_SIZE;
    store.activeThemeId = data.activeThemeId ?? "dark";
    // Merge over defaults so settings added in later versions hydrate sanely
    // from an older persisted blob.
    store.editorSettings = {
      ...DEFAULT_EDITOR_SETTINGS,
      ...data.editorSettings,
    };
    store.terminalSettings = {
      ...DEFAULT_TERMINAL_SETTINGS,
      ...data.terminalSettings,
    };

    // Load panel state from the active workspace.
    // If the workspace has no panel state yet (first run with new format),
    // fall back to the legacy top-level fields for a one-time migration.
    const activeWs = store.activeWorkspaceId
      ? store.workspaces[store.activeWorkspaceId]
      : null;
    if (activeWs && activeWs.sidePanelLocations !== undefined) {
      loadPanelStateFromWorkspace(activeWs);
    } else {
      // Legacy / migration path
      store.sidePanelLocations = data.sidePanelLocations ?? {};
      store.sidePanelOrder = data.sidePanelOrder ?? {};
      store.activeSidePanelTabs = data.activeSidePanelTabs ?? {};
      store.sidePanelScrollPositions = data.sidePanelScrollPositions ?? {};
      store.extensionState = data.extensionState ?? {};
    }
  }
  store.hydrated = true;
  subscribe(store, schedulePersist);
}

function schedulePersist() {
  if (!store.hydrated) return;
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    persistNow().catch((err) => console.error("persist failed", err));
  }, SAVE_DEBOUNCE_MS);
}

async function persistNow(): Promise<void> {
  const s = await getStore();

  // Build a workspace snapshot that includes the current panel state for the
  // active workspace. We do this without mutating the store (which would
  // trigger another persist cycle).
  const activeId = store.activeWorkspaceId;
  const workspacesSnapshot: Record<string, Workspace> = {};
  for (const [id, ws] of Object.entries(store.workspaces)) {
    if (id === activeId) {
      workspacesSnapshot[id] = {
        ...ws,
        sidePanelLocations: { ...store.sidePanelLocations },
        sidePanelOrder: { ...store.sidePanelOrder },
        activeSidePanelTabs: { ...store.activeSidePanelTabs },
        sidePanelScrollPositions: { ...store.sidePanelScrollPositions },
        extensionState: deepCloneExtensionState(store.extensionState),
        leftPanelCollapsed: store.leftPanelCollapsed,
        rightPanelCollapsed: store.rightPanelCollapsed,
      };
    } else {
      workspacesSnapshot[id] = { ...ws };
    }
  }

  const snapshot: Persisted = {
    workspaces: workspacesSnapshot,
    workspaceOrder: [...store.workspaceOrder],
    activeWorkspaceId: store.activeWorkspaceId,
    uiFontSize: store.uiFontSize,
    activeThemeId: store.activeThemeId,
    editorSettings: { ...store.editorSettings },
    terminalSettings: { ...store.terminalSettings },
  };
  await s.set("state", snapshot);
  await s.save();
}

function deepCloneExtensionState(
  src: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const k of Object.keys(src)) out[k] = { ...src[k] };
  return out;
}

export function persistImmediately(): Promise<void> {
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
  return persistNow();
}

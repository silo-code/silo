import { load, Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import { subscribe } from "valtio";
import { store } from "./store";
import {
  DEFAULT_UI_FONT_SIZE,
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_TERMINAL_SETTINGS,
} from "./types";
import type { Workspace } from "./types";
import { loadPanelStateFromWorkspace } from "./workspaces";
import { setBackupDir, sweepEditorBackups } from "./editor-backups";
import {
  buildIndex,
  cloneExtensionState,
  diffWorkspaceWrites,
  reconcileWorkspaceListing,
  splitPersistedState,
  withActivePanelState,
  type LegacyPersisted,
  type PanelState,
  type PersistedIndex,
} from "./persistence-model";

// Persistence (ADR 0022, tier 1 "config"): under the identity-keyed config root
// (`~/.config/silo[-<id>]`, resolved by the caller), workspaces are stored
// one-per-file at `<root>/workspaces/<id>.json`, with global prefs + order/active
// in a single `<root>/app-state.json` index. We use `@tauri-apps/plugin-store`
// — one Store instance per file — pointed at absolute paths under the config dir;
// it serializes pretty-printed JSON and is the proven I/O path the app already
// ran on, and `save()` creates parent dirs for us. `persistence-model.ts` owns
// the pure logic; this module is the glue.
//
// `state/` is a leaf layer that must not import `services/` (the host's one-way
// dependency rule), so the identity-keyed config root is resolved by the caller
// (`userConfigDir()` in main.tsx) and passed into `hydrate`. We still talk to the
// platform directly for `invoke` (the two Rust fs commands plugin-store doesn't
// cover — directory listing + delete).

const LEGACY_STORE_FILE = "app-state.json"; // legacy monolithic blob in app-data
const INDEX_KEY = "state";
const WORKSPACE_KEY = "workspace";
const SAVE_DEBOUNCE_MS = 250;
// We manage save timing ourselves (debounce + quit-flush), so disable the
// plugin's own autosave. Empty `defaults` injects nothing into existing files.
const STORE_OPTS = { defaults: {}, autoSave: false } as const;

let wsDir = "";
let indexStore: Store | null = null;
const wsStores = new Map<string, Store>();
let lastWritten = new Map<string, string>();
let saveTimer: number | null = null;

function workspacePath(id: string): string {
  return `${wsDir}/${id}.json`;
}

interface RawDirEntry {
  name: string;
  path: string;
  is_dir: boolean;
}

/** List `~/.config/silo/workspaces`; `[]` if it doesn't exist yet. */
async function listWorkspaceFiles(): Promise<RawDirEntry[]> {
  try {
    return await invoke<RawDirEntry[]>("fs_read_dir", { path: wsDir });
  } catch {
    return [];
  }
}

/**
 * One-time, non-destructive migration from the legacy monolithic blob (in the
 * app-data dir) to per-workspace files under `~/.config/silo`. Runs only when the
 * config index has no state yet. The legacy file is left untouched (trivial
 * rollback); the index is written last, so a crash mid-migration just re-runs it
 * (idempotent from the same source blob).
 */
async function migrateLegacyBlob(indexStore: Store): Promise<void> {
  let legacy: LegacyPersisted | null = null;
  try {
    const legacyStore = await load(LEGACY_STORE_FILE, STORE_OPTS);
    legacy = (await legacyStore.get<LegacyPersisted>(INDEX_KEY)) ?? null;
    await legacyStore.close();
  } catch {
    return; // no legacy store / unreadable — nothing to migrate
  }
  if (!legacy) return;

  const { index, workspaces } = splitPersistedState(legacy);
  for (const [id, ws] of Object.entries(workspaces)) {
    try {
      const s = await load(workspacePath(id), STORE_OPTS);
      await s.set(WORKSPACE_KEY, ws);
      await s.save();
      await s.close();
    } catch (err) {
      console.error(`migrate workspace ${id} failed`, err);
    }
  }
  await indexStore.set(INDEX_KEY, index);
  await indexStore.save();
}

/** @param configDir the identity-keyed user-config root (see `userConfigDir`). */
export async function hydrate(configDir: string): Promise<void> {
  wsDir = `${configDir}/workspaces`;
  setBackupDir(configDir);
  const indexPath = `${configDir}/${LEGACY_STORE_FILE}`;

  // Index: global prefs + order/active. A new/absent index reads as null — that's
  // either a fresh install or a pre-migration app-data blob, so attempt the
  // one-time migration (a no-op when there's no legacy blob) and re-read.
  indexStore = await load(indexPath, STORE_OPTS);
  let index = (await indexStore.get<PersistedIndex>(INDEX_KEY)) ?? null;
  if (index === null) {
    await migrateLegacyBlob(indexStore);
    index = (await indexStore.get<PersistedIndex>(INDEX_KEY)) ?? null;
  }

  // Merge settings over defaults so settings added in later versions hydrate
  // sanely from an older blob. (Order/active are reconciled below, after we know
  // which workspace files actually loaded.)
  if (index) {
    store.uiFontSize = index.uiFontSize ?? DEFAULT_UI_FONT_SIZE;
    store.activeThemeId = index.activeThemeId ?? "dark";
    store.editorSettings = {
      ...DEFAULT_EDITOR_SETTINGS,
      ...index.editorSettings,
    };
    store.terminalSettings = {
      ...DEFAULT_TERMINAL_SETTINGS,
      ...index.terminalSettings,
    };
    store.globalExtensionState = index.globalExtensionState
      ? cloneExtensionState(index.globalExtensionState)
      : {};
  }

  // One file per workspace. Invalid files are skipped (like the theme loader),
  // so a hand-edit that breaks JSON drops one workspace rather than failing boot.
  const workspaces: Record<string, Workspace> = {};
  const entries = await listWorkspaceFiles();
  await Promise.all(
    entries
      .filter((e) => !e.is_dir && e.name.endsWith(".json"))
      .map(async (e) => {
        try {
          const s = await load(e.path, STORE_OPTS);
          const ws = await s.get<Workspace>(WORKSPACE_KEY);
          if (ws && typeof ws.id === "string") {
            workspaces[ws.id] = ws;
            wsStores.set(ws.id, s);
          } else {
            await s.close();
          }
        } catch {
          // skip invalid file
        }
      }),
  );
  store.workspaces = workspaces;

  // Drop hot-exit backups for editors that no longer exist (tabs closed in a
  // prior session, or crash-orphans). Fire-and-forget so it never delays boot.
  const liveEditorIds = new Set<string>();
  for (const ws of Object.values(workspaces))
    for (const ed of ws.editors) liveEditorIds.add(ed.id);
  void sweepEditorBackups(liveEditorIds);

  // Order/active come from the index, but any workspace file on disk that the
  // index omits is appended (self-healing) so a lost/partial index can't hide
  // real workspaces; entries whose file didn't load are dropped.
  const listing = reconcileWorkspaceListing(index, Object.keys(workspaces));
  store.workspaceOrder = listing.workspaceOrder;
  store.activeWorkspaceId = listing.activeWorkspaceId;

  // Seed lastWritten from the loaded files so the first flush only rewrites what
  // actually changes afterward.
  lastWritten = new Map(
    Object.entries(workspaces).map(([id, ws]) => [id, JSON.stringify(ws)]),
  );

  // Hydrate the global panel-state fields from the active workspace.
  const activeWs = store.activeWorkspaceId
    ? workspaces[store.activeWorkspaceId]
    : null;
  if (activeWs) loadPanelStateFromWorkspace(activeWs);

  // Side-dock collapse state is per-workspace. Fall back to the index for a
  // one-time migration carry-over from installs that stored it globally.
  store.leftPanelCollapsed =
    activeWs?.leftPanelCollapsed ?? index?.leftPanelCollapsed ?? false;
  store.rightPanelCollapsed =
    activeWs?.rightPanelCollapsed ?? index?.rightPanelCollapsed ?? false;

  // Side-panel visibility is per-workspace, restored from the active workspace
  // by loadPanelStateFromWorkspace above (defaults to all-visible when absent).

  store.hydrated = true;
  subscribe(store, schedulePersist);
}

function snapshotPanelState(): PanelState {
  return {
    sidePanelLocations: { ...store.sidePanelLocations },
    sidePanelOrder: { ...store.sidePanelOrder },
    activeSidePanelTabs: { ...store.activeSidePanelTabs },
    sidePanelScrollPositions: { ...store.sidePanelScrollPositions },
    sidePanelVisibility: { ...store.sidePanelVisibility },
    extensionState: cloneExtensionState(store.extensionState),
    leftPanelCollapsed: store.leftPanelCollapsed,
    rightPanelCollapsed: store.rightPanelCollapsed,
  };
}

async function doPersist(): Promise<void> {
  if (!indexStore) return;

  // Build each workspace's record, merging the active workspace's live panel
  // state (it isn't mirrored onto the workspace object until save time).
  const activeId = store.activeWorkspaceId;
  const panel = snapshotPanelState();
  const records = new Map<string, Workspace>();
  const next = new Map<string, string>();
  for (const [id, ws] of Object.entries(store.workspaces)) {
    const rec = id === activeId ? withActivePanelState(ws, panel) : { ...ws };
    records.set(id, rec);
    next.set(id, JSON.stringify(rec));
  }

  const { toWrite, toDelete } = diffWorkspaceWrites(lastWritten, next);

  for (const id of toWrite) {
    let s = wsStores.get(id);
    if (!s) {
      s = await load(workspacePath(id), STORE_OPTS);
      wsStores.set(id, s);
    }
    await s.set(WORKSPACE_KEY, records.get(id));
    await s.save();
  }

  for (const id of toDelete) {
    const s = wsStores.get(id);
    if (s) {
      await s.close();
      wsStores.delete(id);
    }
    try {
      await invoke("fs_delete", { path: workspacePath(id) });
    } catch {
      // already gone
    }
  }

  lastWritten = next;

  await indexStore.set(
    INDEX_KEY,
    buildIndex({
      workspaceOrder: [...store.workspaceOrder],
      activeWorkspaceId: store.activeWorkspaceId,
      uiFontSize: store.uiFontSize,
      activeThemeId: store.activeThemeId,
      editorSettings: { ...store.editorSettings },
      terminalSettings: { ...store.terminalSettings },
      globalExtensionState: store.globalExtensionState,
    }),
  );
  await indexStore.save();
}

// Serialize persists so a debounce that fires mid-write can't interleave
// set/save on the same Store. Each run reads the latest store state, so coalesced
// runs converge.
let chain: Promise<void> = Promise.resolve();
function persistNow(): Promise<void> {
  chain = chain.catch(() => {}).then(() => doPersist());
  return chain;
}

function schedulePersist() {
  if (!store.hydrated) return;
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = null;
    persistNow().catch((err) => console.error("persist failed", err));
  }, SAVE_DEBOUNCE_MS);
}

export function persistImmediately(): Promise<void> {
  if (saveTimer !== null) {
    window.clearTimeout(saveTimer);
    saveTimer = null;
  }
  return persistNow();
}

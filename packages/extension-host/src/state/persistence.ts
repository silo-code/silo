import { load, Store } from "@tauri-apps/plugin-store";
import { invoke } from "@tauri-apps/api/core";
import { subscribe } from "valtio";
import { store } from "./store";
import {
  DEFAULT_UI_FONT_SIZE,
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_TERMINAL_SETTINGS,
  DEFAULT_SMALL_SCREEN_THRESHOLD_PX,
  DEFAULT_SMALL_SCREEN_PEEK_WIDTH_PX,
  DEFAULT_GLOBAL_PANEL_LAYOUT,
  DEFAULT_SHARED_COLUMN_WIDTHS,
} from "./types";
import type { WorkspaceInternal } from "./types";
import { migratePanelIds } from "./panel-id-migration";
import { normalizeTerminalKinds } from "./terminal-kind-migration";
import { migrateGlobalExtensionState } from "./extension-id-migration";
import { loadPanelStateFromWorkspace } from "./workspaces";
import {
  capturePanelState,
  captureGlobalPanelLayout,
  applyGlobalPanelLayout,
} from "./panel-state";
import { setBackupDir, sweepEditorBackups } from "./editor-backups";
import { replaceAgentProfiles } from "./agent-profiles";
import {
  buildIndex,
  cloneExtensionState,
  cloneAgentState,
  loadAgentProfiles,
  cloneGlobalPanelLayout,
  diffWorkspaceWrites,
  reconcilePanelOrder,
  reconcileWorkspaceListing,
  splitPersistedState,
  withActivePanelState,
  withActiveNonGlobalPanelState,
  type LegacyPersisted,
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
  let extensionStateMigrated = false;
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
    store.smallScreenModeEnabled = index.smallScreenModeEnabled ?? true;
    store.smallScreenThresholdPx =
      index.smallScreenThresholdPx ?? DEFAULT_SMALL_SCREEN_THRESHOLD_PX;
    store.smallScreenPeekWidthLeftPx =
      index.smallScreenPeekWidthLeftPx ?? DEFAULT_SMALL_SCREEN_PEEK_WIDTH_PX;
    store.smallScreenPeekWidthRightPx =
      index.smallScreenPeekWidthRightPx ?? DEFAULT_SMALL_SCREEN_PEEK_WIDTH_PX;
    store.globalExtensionState = index.globalExtensionState
      ? cloneExtensionState(index.globalExtensionState)
      : {};
    if (migrateGlobalExtensionState(store.globalExtensionState)) {
      extensionStateMigrated = true;
    }
    store.agentState = index.agentState
      ? cloneAgentState(index.agentState)
      : {};
    // Agent Profiles (RFC 0033). Loaded here — inside `hydrate`, which
    // `main.tsx` awaits before `ExtensionManager.loadInstalled()` — so the
    // deprecated-`TerminalKind` mapping in `getTerminalService().create` and
    // the `+` menu both resolve against a populated list from first activation.
    // Malformed entries are dropped rather than failing hydration.
    //
    // Identity-preserving: `core.agents-settings` subscribes to this array in
    // `activateBuiltins()`, before this async hydrate runs (RFC 0033 phase 2 —
    // the per-profile `core.newAgent.<id>` command sync). See
    // `replaceAgentProfiles`.
    replaceAgentProfiles(loadAgentProfiles(index.agentProfiles));
    // Absent in an older index: widths were global, which is this flag on.
    store.sharedColumnWidthsEnabled =
      index.sharedColumnWidthsEnabled ?? DEFAULT_SHARED_COLUMN_WIDTHS;
    store.globalPanelLayoutEnabled = index.globalPanelLayoutEnabled ?? false;
    store.globalActiveTabEnabled = index.globalActiveTabEnabled ?? false;
    store.globalPanelLayout = index.globalPanelLayout
      ? cloneGlobalPanelLayout(index.globalPanelLayout)
      : structuredClone(DEFAULT_GLOBAL_PANEL_LAYOUT);
    store.globalActiveSidePanelTabs = index.globalActiveSidePanelTabs
      ? { ...index.globalActiveSidePanelTabs }
      : {};
  }

  // One file per workspace. Invalid files are skipped (like the theme loader),
  // so a hand-edit that breaks JSON drops one workspace rather than failing boot.
  const workspaces: Record<string, WorkspaceInternal> = {};
  const entries = await listWorkspaceFiles();
  await Promise.all(
    entries
      .filter((e) => !e.is_dir && e.name.endsWith(".json"))
      .map(async (e) => {
        try {
          const s = await load(e.path, STORE_OPTS);
          const ws = await s.get<WorkspaceInternal>(WORKSPACE_KEY);
          if (ws && typeof ws.id === "string") {
            workspaces[ws.id] = normalizeTerminalKinds(migratePanelIds(ws));
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

  // Groups — absent in older indexes; default to empty. The workspace→group
  // reverse map is derived at runtime, so nothing to restore here.
  store.groups = index?.groups ?? {};
  // panelOrder is the interleaved top-level list, rebuilt defensively so a
  // partial or pre-panelOrder index can never hide a workspace or group.
  store.panelOrder = reconcilePanelOrder(
    index?.panelOrder,
    store.groups,
    store.workspaceOrder,
  );

  // Seed lastWritten from the loaded files so the first flush only rewrites what
  // actually changes afterward.
  lastWritten = new Map(
    Object.entries(workspaces).map(([id, ws]) => [id, JSON.stringify(ws)]),
  );

  // Hydrate the global panel-state fields from the active workspace. Side-dock
  // collapse state is per-workspace; back-fill it from the index first for a
  // one-time migration carry-over from installs that stored it globally, so
  // the load below (which picks the live layout mode — small-screen mode may
  // already be active by now) sees a complete record.
  const activeWs = store.activeWorkspaceId
    ? workspaces[store.activeWorkspaceId]
    : null;
  if (activeWs) {
    activeWs.leftPanelCollapsed ??= index?.leftPanelCollapsed ?? false;
    activeWs.rightPanelCollapsed ??= index?.rightPanelCollapsed ?? false;
    loadPanelStateFromWorkspace(activeWs);
  }

  // Side-panel visibility is per-workspace, restored from the active workspace
  // by loadPanelStateFromWorkspace above (defaults to all-visible when absent).

  // Global Side Panel Layout (ADR 0035): loadPanelStateFromWorkspace above
  // deliberately leaves arrangement fields alone when the flag is on (an
  // ordinary switch mustn't clobber a live edit against a stale snapshot —
  // see its doc comment), so seed them once here, at startup, from the
  // record just read out of the index.
  if (store.globalPanelLayoutEnabled) {
    applyGlobalPanelLayout(store.globalPanelLayout);
  }

  store.hydrated = true;
  subscribe(store, schedulePersist);
  if (extensionStateMigrated) {
    void persistImmediately();
  }
}

async function doPersist(): Promise<void> {
  if (!indexStore) return;

  // Build each workspace's record, merging the active workspace's live panel
  // state (it isn't mirrored onto the workspace object until save time).
  const activeId = store.activeWorkspaceId;
  const panel = capturePanelState();
  const records = new Map<string, WorkspaceInternal>();
  const next = new Map<string, string>();
  for (const [id, ws] of Object.entries(store.workspaces)) {
    // While the global panel layout is on, the active workspace's own
    // arrangement fields must stay exactly as they are on disk (frozen) —
    // only merge in the fields that stay per-workspace regardless.
    const rec =
      id === activeId
        ? store.globalPanelLayoutEnabled
          ? withActiveNonGlobalPanelState(
              ws,
              panel,
              store.globalActiveTabEnabled,
            )
          : withActivePanelState(ws, panel)
        : { ...ws };
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
      smallScreenModeEnabled: store.smallScreenModeEnabled,
      smallScreenThresholdPx: store.smallScreenThresholdPx,
      smallScreenPeekWidthLeftPx: store.smallScreenPeekWidthLeftPx,
      smallScreenPeekWidthRightPx: store.smallScreenPeekWidthRightPx,
      globalExtensionState: store.globalExtensionState,
      agentState: store.agentState,
      agentProfiles: [...store.agentProfiles],
      groups: store.groups,
      panelOrder: [...store.panelOrder],
      sharedColumnWidthsEnabled: store.sharedColumnWidthsEnabled,
      globalPanelLayoutEnabled: store.globalPanelLayoutEnabled,
      globalActiveTabEnabled: store.globalActiveTabEnabled,
      // While the flag is on, live state is the source of truth; while off,
      // `store.globalPanelLayout`/`globalActiveSidePanelTabs` already hold
      // the frozen value from when it was last turned off.
      globalPanelLayout: store.globalPanelLayoutEnabled
        ? captureGlobalPanelLayout()
        : store.globalPanelLayout,
      globalActiveSidePanelTabs: store.globalActiveTabEnabled
        ? { ...store.activeSidePanelTabs }
        : store.globalActiveSidePanelTabs,
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

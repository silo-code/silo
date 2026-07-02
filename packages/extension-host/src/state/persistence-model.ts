// Pure persistence logic, factored out of `persistence.ts` so it can be unit
// tested without Tauri/`plugin-store` (the I/O glue stays in persistence.ts).
//
// Storage layout (ADR 0022, tier 1 "config"): under the identity-keyed config
// root (`~/.config/silo[-<id>]`), workspaces live one-per-file at
// `<root>/workspaces/<id>.json`, with global prefs + order/active in a single
// `<root>/app-state.json` index. These helpers own the migration
// fan-out from the legacy monolithic blob, the index shape, the active-workspace
// panel-state merge, and the write/delete reconciliation.

import type {
  EditorSettings,
  SidePanelSlot,
  TerminalSettings,
  WorkspaceInternal,
  WorkspaceGroup,
} from "./types";

/** The global index blob — everything in the old store *except* the workspaces
 * map (which is now one file per workspace). */
export interface PersistedIndex {
  workspaceOrder: string[];
  activeWorkspaceId: string | null;
  uiFontSize?: number;
  activeThemeId?: string;
  editorSettings?: Partial<EditorSettings>;
  terminalSettings?: Partial<TerminalSettings>;
  // Per-extension global storage (`ctx.storage.global`), keyed by extension id.
  // Global (not per-workspace), so it lives in the index; absent in older
  // indexes, in which case extensions start from their defaults.
  globalExtensionState?: Record<string, Record<string, unknown>>;
  // Legacy migration fields — stored globally in old installs, now per-workspace.
  leftPanelCollapsed?: boolean;
  rightPanelCollapsed?: boolean;
  // Workspace panel groups — absent in older indexes (pre-group installs).
  // Membership lives in each group's `workspaceOrder`; the reverse map is
  // derived at runtime, never persisted. `panelOrder` is the interleaved
  // top-level list (ungrouped workspace ids + group ids).
  groups?: Record<string, WorkspaceGroup>;
  panelOrder?: string[];
}

/** The legacy monolithic blob (one `"state"` key in the app-data store) we
 * migrate *from*. Workspaces + global prefs + top-level panel state together. */
export interface LegacyPersisted {
  workspaces: Record<string, WorkspaceInternal>;
  workspaceOrder: string[];
  activeWorkspaceId: string | null;
  uiFontSize?: number;
  activeThemeId?: string;
  editorSettings?: Partial<EditorSettings>;
  terminalSettings?: Partial<TerminalSettings>;
  // Pre-per-workspace blobs kept panel state at the top level.
  sidePanelLocations?: Record<string, SidePanelSlot>;
  sidePanelOrder?: Record<string, number>;
  activeSidePanelTabs?: Record<string, string>;
  sidePanelScrollPositions?: Record<string, number>;
  extensionState?: Record<string, Record<string, unknown>>;
}

/** The active-workspace panel-state snapshot merged in at save time (the live
 * global store fields, which aren't mirrored onto the workspace until then). */
export interface PanelState {
  sidePanelLocations: Record<string, SidePanelSlot>;
  sidePanelOrder: Record<string, number>;
  activeSidePanelTabs: Record<string, string>;
  sidePanelScrollPositions: Record<string, number>;
  sidePanelVisibility: Record<string, boolean>;
  extensionState: Record<string, Record<string, unknown>>;
  leftPanelCollapsed: boolean;
  rightPanelCollapsed: boolean;
}

/** Deep-clone the two-level extension-state bag so a stored snapshot can't alias
 * (and later mutate via) the live store. */
export function cloneExtensionState(
  src: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const k of Object.keys(src)) out[k] = { ...src[k] };
  return out;
}

/**
 * Split the legacy monolithic blob into the new index + per-workspace map.
 *
 * Also performs the one-time carry of *top-level* panel state onto the active
 * workspace: the oldest blobs stored panel state globally rather than
 * per-workspace, so a workspace that predates that migration gets the global
 * fields folded in here (mirrors the old runtime fallback, now done once at
 * migration time so each workspace file is self-contained).
 */
export function splitPersistedState(legacy: LegacyPersisted): {
  index: PersistedIndex;
  workspaces: Record<string, WorkspaceInternal>;
} {
  const workspaces: Record<string, WorkspaceInternal> = {
    ...(legacy.workspaces ?? {}),
  };
  const activeId = legacy.activeWorkspaceId ?? null;

  if (
    activeId &&
    workspaces[activeId] &&
    workspaces[activeId].sidePanelLocations === undefined
  ) {
    workspaces[activeId] = {
      ...workspaces[activeId],
      sidePanelLocations: { ...(legacy.sidePanelLocations ?? {}) },
      sidePanelOrder: { ...(legacy.sidePanelOrder ?? {}) },
      activeSidePanelTabs: { ...(legacy.activeSidePanelTabs ?? {}) },
      sidePanelScrollPositions: { ...(legacy.sidePanelScrollPositions ?? {}) },
      extensionState: cloneExtensionState(legacy.extensionState ?? {}),
    };
  }

  const index: PersistedIndex = buildIndex({
    workspaceOrder: legacy.workspaceOrder ?? Object.keys(workspaces),
    activeWorkspaceId: activeId,
    uiFontSize: legacy.uiFontSize,
    activeThemeId: legacy.activeThemeId,
    editorSettings: legacy.editorSettings,
    terminalSettings: legacy.terminalSettings,
  });

  return { index, workspaces };
}

/** Assemble the index blob from a store-shaped snapshot, copying containers so
 * the result doesn't alias live state. */
export function buildIndex(snapshot: PersistedIndex): PersistedIndex {
  return {
    workspaceOrder: [...snapshot.workspaceOrder],
    activeWorkspaceId: snapshot.activeWorkspaceId,
    uiFontSize: snapshot.uiFontSize,
    activeThemeId: snapshot.activeThemeId,
    editorSettings: snapshot.editorSettings
      ? { ...snapshot.editorSettings }
      : undefined,
    terminalSettings: snapshot.terminalSettings
      ? { ...snapshot.terminalSettings }
      : undefined,
    globalExtensionState: snapshot.globalExtensionState
      ? cloneExtensionState(snapshot.globalExtensionState)
      : undefined,
    groups: snapshot.groups ? cloneGroups(snapshot.groups) : undefined,
    panelOrder: snapshot.panelOrder ? [...snapshot.panelOrder] : undefined,
  };
}

function cloneGroups(
  src: Record<string, WorkspaceGroup>,
): Record<string, WorkspaceGroup> {
  const out: Record<string, WorkspaceGroup> = {};
  for (const [id, group] of Object.entries(src)) {
    out[id] = { ...group, workspaceOrder: [...group.workspaceOrder] };
  }
  return out;
}

/**
 * Rebuild the interleaved top-level panel order defensively from a saved order:
 * keep saved entries that still exist (in saved order), drop stale ids, and
 * append any top-level entry the saved order missed — so a partial or
 * pre-`panelOrder` index can never hide a workspace or group. Top-level entries
 * are the ungrouped workspaces (in `workspaceOrder`) plus the group ids;
 * grouped workspaces live inside their group and are not top-level.
 */
export function reconcilePanelOrder(
  saved: readonly string[] | undefined,
  groups: Record<string, { workspaceOrder: readonly string[] }>,
  workspaceOrder: readonly string[],
): string[] {
  const grouped = new Set<string>();
  for (const g of Object.values(groups))
    for (const w of g.workspaceOrder) grouped.add(w);
  const topLevel = [
    ...workspaceOrder.filter((id) => !grouped.has(id)),
    ...Object.keys(groups),
  ];
  const valid = new Set(topLevel);
  const savedList = saved ?? [];
  const savedSet = new Set(savedList);
  return [
    ...savedList.filter((id) => valid.has(id)),
    ...topLevel.filter((id) => !savedSet.has(id)),
  ];
}

/** Return a copy of `ws` with the live panel state merged in — used for the
 * active workspace at save time. Non-active workspaces are persisted as-is. */
export function withActivePanelState(
  ws: WorkspaceInternal,
  panel: PanelState,
): WorkspaceInternal {
  return {
    ...ws,
    sidePanelLocations: { ...panel.sidePanelLocations },
    sidePanelOrder: { ...panel.sidePanelOrder },
    activeSidePanelTabs: { ...panel.activeSidePanelTabs },
    sidePanelScrollPositions: { ...panel.sidePanelScrollPositions },
    sidePanelVisibility: { ...panel.sidePanelVisibility },
    extensionState: cloneExtensionState(panel.extensionState),
    leftPanelCollapsed: panel.leftPanelCollapsed,
    rightPanelCollapsed: panel.rightPanelCollapsed,
  };
}

/**
 * Reconcile the persisted order/active against the workspaces that actually
 * loaded from disk, **self-healingly**.
 *
 * The index's `workspaceOrder` sets the order for the workspaces it lists (so the
 * user's arrangement is preserved), but it is not the sole authority on
 * existence: a soft-closed workspace stays in the order (closing never removes
 * it), so any workspace *file on disk* that the index order omits is treated as
 * an **orphan and appended** rather than left invisible. This means a transient
 * read failure (or a partial/empty index) can't permanently hide workspaces —
 * the next clean boot pulls them back in. Order entries whose file didn't load
 * are dropped; the active id is kept unless its workspace is gone, in which case
 * it falls to the first workspace (or null).
 */
export function reconcileWorkspaceListing(
  index: PersistedIndex | null,
  loadedIds: string[],
): { workspaceOrder: string[]; activeWorkspaceId: string | null } {
  const have = new Set(loadedIds);
  const ordered = (index?.workspaceOrder ?? []).filter((id) => have.has(id));
  const inOrder = new Set(ordered);
  const orphans = loadedIds.filter((id) => !inOrder.has(id));
  const workspaceOrder = [...ordered, ...orphans];

  let activeWorkspaceId = index?.activeWorkspaceId ?? null;
  if (activeWorkspaceId && !have.has(activeWorkspaceId)) {
    activeWorkspaceId = workspaceOrder[0] ?? null;
  }
  return { workspaceOrder, activeWorkspaceId };
}

/**
 * Reconcile two snapshots of serialized workspace JSON keyed by id: which files
 * to (re)write (new or changed) and which to delete (present before, gone now).
 * Unchanged ids appear in neither list, so a flush only touches what moved.
 */
export function diffWorkspaceWrites(
  prev: Map<string, string>,
  next: Map<string, string>,
): { toWrite: string[]; toDelete: string[] } {
  const toWrite: string[] = [];
  for (const [id, json] of next) {
    if (prev.get(id) !== json) toWrite.push(id);
  }
  const toDelete: string[] = [];
  for (const id of prev.keys()) {
    if (!next.has(id)) toDelete.push(id);
  }
  return { toWrite, toDelete };
}

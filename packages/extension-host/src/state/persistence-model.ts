// Pure persistence logic, factored out of `persistence.ts` so it can be unit
// tested without Tauri/`plugin-store` (the I/O glue stays in persistence.ts).
//
// Storage layout (ADR 0022, tier 1 "config"): under the identity-keyed config
// root (`~/.config/silo[-<id>]`), workspaces live one-per-file at
// `<root>/workspaces/<id>.json`, with global prefs + order/active in a single
// `<root>/app-state.json` index. These helpers own the migration
// fan-out from the legacy monolithic blob, the index shape, the active-workspace
// panel-state merge, and the write/delete reconciliation.

import { cloneTrees } from "./side-dock-tree";
import type {
  EditorSettings,
  GlobalPanelLayout,
  PanelStateSnapshot,
  SidePanelSlot,
  TerminalSettings,
  WorkspaceInternal,
  WorkspaceGroup,
  PersistedAgentInfo,
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
  // Global (not per-workspace) small-screen-mode preference — see
  // `small-screen-mode.ts`. Absent in older indexes: defaults applied at hydrate.
  smallScreenModeEnabled?: boolean;
  smallScreenThresholdPx?: number;
  // Peek overlay width — also global, independent of either layout mode's
  // column width. See `small-screen-mode.ts`.
  smallScreenPeekWidthLeftPx?: number;
  smallScreenPeekWidthRightPx?: number;
  // Per-extension global storage (`ctx.storage.global`), keyed by extension id.
  // Global (not per-workspace), so it lives in the index; absent in older
  // indexes, in which case extensions start from their defaults.
  globalExtensionState?: Record<string, Record<string, unknown>>;
  // Host-owned `ctx.agents` state, keyed by terminal id. Global for the same
  // reason globalExtensionState is: not per-workspace-scoped. Absent in
  // older indexes (pre-ctx.agents installs).
  agentState?: Record<string, PersistedAgentInfo>;
  // Legacy migration fields — stored globally in old installs, now per-workspace.
  leftPanelCollapsed?: boolean;
  rightPanelCollapsed?: boolean;
  // Workspace panel groups — absent in older indexes (pre-group installs).
  // Membership lives in each group's `workspaceOrder`; the reverse map is
  // derived at runtime, never persisted. `panelOrder` is the interleaved
  // top-level list (ungrouped workspace ids + group ids).
  groups?: Record<string, WorkspaceGroup>;
  panelOrder?: string[];
  // "Global Side Panel Layout" (ADR 0035) — global (not per-workspace), so it
  // lives in the index like `smallScreenModeEnabled`. Absent in older
  // indexes: defaults (both off, empty layout) applied at hydrate.
  // Whether side-dock widths are shared across workspaces. Absent in an older
  // index, where widths were always global — so it defaults to true at hydrate.
  sharedColumnWidthsEnabled?: boolean;
  globalPanelLayoutEnabled?: boolean;
  globalActiveTabEnabled?: boolean;
  globalPanelLayout?: GlobalPanelLayout;
  globalActiveSidePanelTabs?: Record<string, string>;
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
 * global store fields, which aren't mirrored onto the workspace until then).
 * Declared with the store shape it's captured from — see `state/types.ts`. */
export type PanelState = PanelStateSnapshot;

/** Deep-clone the two-level extension-state bag so a stored snapshot can't alias
 * (and later mutate via) the live store. */
export function cloneExtensionState(
  src: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const k of Object.keys(src)) out[k] = { ...src[k] };
  return out;
}

/** Shallow-clone `ctx.agents` persisted state so the result doesn't alias
 * live state — each `PersistedAgentInfo` is a flat object, so a per-key
 * spread (like {@link cloneExtensionState}) is sufficient. */
export function cloneAgentState(
  src: Record<string, PersistedAgentInfo>,
): Record<string, PersistedAgentInfo> {
  const out: Record<string, PersistedAgentInfo> = {};
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
    smallScreenModeEnabled: snapshot.smallScreenModeEnabled,
    smallScreenThresholdPx: snapshot.smallScreenThresholdPx,
    smallScreenPeekWidthLeftPx: snapshot.smallScreenPeekWidthLeftPx,
    smallScreenPeekWidthRightPx: snapshot.smallScreenPeekWidthRightPx,
    globalExtensionState: snapshot.globalExtensionState
      ? cloneExtensionState(snapshot.globalExtensionState)
      : undefined,
    agentState: snapshot.agentState
      ? cloneAgentState(snapshot.agentState)
      : undefined,
    groups: snapshot.groups ? cloneGroups(snapshot.groups) : undefined,
    panelOrder: snapshot.panelOrder ? [...snapshot.panelOrder] : undefined,
    sharedColumnWidthsEnabled: snapshot.sharedColumnWidthsEnabled,
    globalPanelLayoutEnabled: snapshot.globalPanelLayoutEnabled,
    globalActiveTabEnabled: snapshot.globalActiveTabEnabled,
    globalPanelLayout: snapshot.globalPanelLayout
      ? cloneGlobalPanelLayout(snapshot.globalPanelLayout)
      : undefined,
    globalActiveSidePanelTabs: snapshot.globalActiveSidePanelTabs
      ? { ...snapshot.globalActiveSidePanelTabs }
      : undefined,
  };
}

/** Deep-clone a {@link GlobalPanelLayout} record so a stored snapshot can't
 * alias (and later mutate via) the live store. Exported: also used by
 * `persistence.ts` to hydrate `store.globalPanelLayout` from the index. */
export function cloneGlobalPanelLayout(
  g: GlobalPanelLayout,
): GlobalPanelLayout {
  return {
    // Left absent when absent, so a pre-RFC-0027 index still migrates from
    // `sidePanelLocations` instead of silently adopting a default tree.
    ...(g.sideDockTrees ? { sideDockTrees: cloneTrees(g.sideDockTrees) } : {}),
    sidePanelLocations: { ...g.sidePanelLocations },
    sidePanelOrder: { ...g.sidePanelOrder },
    sidePanelVisibility: { ...g.sidePanelVisibility },
    leftPanelCollapsed: g.leftPanelCollapsed,
    rightPanelCollapsed: g.rightPanelCollapsed,
    ...(g.smallScreenCollapsed
      ? { smallScreenCollapsed: { ...g.smallScreenCollapsed } }
      : {}),
  };
}

function cloneGroups(
  src: Record<string, WorkspaceGroup>,
): Record<string, WorkspaceGroup> {
  const out: Record<string, WorkspaceGroup> = {};
  for (const [id, group] of Object.entries(src)) {
    out[id] = {
      ...group,
      workspaceOrder: [...group.workspaceOrder],
      ...(group.closedMemberIds
        ? { closedMemberIds: [...group.closedMemberIds] }
        : {}),
    };
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
  // `PanelState` is by definition the record's panel fields, so the merge is
  // the spread — no field list to keep in step. The containers are already
  // copies (`capturePanelState` clones them off the live store), so the result
  // can't alias state anyone still mutates.
  return { ...ws, ...panel };
}

/**
 * Like {@link withActivePanelState}, but for when "Global Side Panel Layout"
 * (ADR 0035) is on: merges only the fields that stay per-workspace even
 * then — `extensionState`, `sidePanelScrollPositions`, and
 * `activeSidePanelTabs` (unless its own sub-flag is also global). The
 * workspace's arrangement fields (locations/order/visibility/collapse) are
 * left exactly as they are on disk — the frozen snapshot from before the
 * flag was enabled — since `store.globalPanelLayout` governs them instead.
 */
export function withActiveNonGlobalPanelState(
  ws: WorkspaceInternal,
  panel: PanelState,
  activeTabIsGlobal: boolean,
): WorkspaceInternal {
  return {
    ...ws,
    extensionState: panel.extensionState,
    sidePanelScrollPositions: panel.sidePanelScrollPositions,
    ...(activeTabIsGlobal
      ? {}
      : { activeSidePanelTabs: panel.activeSidePanelTabs }),
    // Widths have their own sharing flag, so they stay per-workspace even while
    // the *layout* is global — sharing an arrangement while sizing each dock
    // separately is exactly what the two independent switches are for.
    // `capturePanelState` already omits this while widths are shared, so the
    // spread leaves the frozen value alone in that case.
    ...(panel.columnWidths ? { columnWidths: panel.columnWidths } : {}),
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

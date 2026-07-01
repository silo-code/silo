import { open } from "@tauri-apps/plugin-dialog";
import { basename } from "@tauri-apps/api/path";
import { store } from "./store";
import { clearEditorBackup } from "./editor-backups";
import type {
  EditorRecord,
  TerminalKind,
  TerminalRecord,
  WorkspaceInternal,
  WorkspaceGroup,
} from "./types";

function uuid(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}-${Math.random().toString(16).slice(2)}`
  );
}

export async function pickFolderAndCreateWorkspace(): Promise<WorkspaceInternal | null> {
  const picked = await open({ directory: true, multiple: false });
  if (!picked || typeof picked !== "string") return null;
  // Normalize to forward slashes so the whole TypeScript layer (path splits,
  // breadcrumbs, file-tree, etc.) can assume POSIX-style separators on every
  // platform.  Windows APIs accept forward slashes, so round-tripping the
  // normalized path back to Tauri commands works without conversion.
  const folder = picked.replace(/\\/g, "/");
  const name = await basename(folder);
  return createWorkspace({ folder, name });
}

export function createWorkspace(input: {
  folder: string;
  name: string;
}): WorkspaceInternal {
  const now = new Date().toISOString();
  const id = `ws_${uuid()}`;
  const ws: WorkspaceInternal = {
    id,
    name: input.name,
    folder: input.folder,
    createdAt: now,
    lastOpenedAt: now,
    terminals: [],
    editors: [],
    dockLayout: null,
    closedAt: null,
  };
  store.workspaces[id] = ws;
  store.workspaceOrder.push(id);
  // New workspaces are ungrouped, so they appear as a top-level panel entry.
  store.panelOrder.push(id);
  store.activeWorkspaceId = id;
  return ws;
}

/** Copy the global panel state into a workspace object. */
export function savePanelStateToWorkspace(wsId: string): void {
  const ws = store.workspaces[wsId];
  if (!ws) return;
  ws.sidePanelLocations = { ...store.sidePanelLocations };
  ws.sidePanelOrder = { ...store.sidePanelOrder };
  ws.activeSidePanelTabs = { ...store.activeSidePanelTabs };
  ws.sidePanelScrollPositions = { ...store.sidePanelScrollPositions };
  ws.sidePanelVisibility = { ...store.sidePanelVisibility };
  ws.leftPanelCollapsed = store.leftPanelCollapsed;
  ws.rightPanelCollapsed = store.rightPanelCollapsed;
  const ext: Record<string, Record<string, unknown>> = {};
  for (const k of Object.keys(store.extensionState))
    ext[k] = { ...store.extensionState[k] };
  ws.extensionState = ext;
}

/** Restore the global panel state from a workspace object. */
export function loadPanelStateFromWorkspace(ws: WorkspaceInternal): void {
  store.sidePanelLocations = { ...(ws.sidePanelLocations ?? {}) };
  store.sidePanelOrder = { ...(ws.sidePanelOrder ?? {}) };
  store.activeSidePanelTabs = { ...(ws.activeSidePanelTabs ?? {}) };
  store.sidePanelScrollPositions = { ...(ws.sidePanelScrollPositions ?? {}) };
  store.sidePanelVisibility = { ...(ws.sidePanelVisibility ?? {}) };
  store.leftPanelCollapsed = ws.leftPanelCollapsed ?? false;
  store.rightPanelCollapsed = ws.rightPanelCollapsed ?? false;
  const ext: Record<string, Record<string, unknown>> = {};
  for (const k of Object.keys(ws.extensionState ?? {}))
    ext[k] = { ...ws.extensionState![k] };
  store.extensionState = ext;
}

export function activateWorkspace(id: string): void {
  const ws = store.workspaces[id];
  if (!ws) return;
  if (ws.closedAt) ws.closedAt = null;
  if (store.activeWorkspaceId === id) return;
  // Capture outgoing panel state before switching.
  if (store.activeWorkspaceId)
    savePanelStateToWorkspace(store.activeWorkspaceId);
  ws.lastOpenedAt = new Date().toISOString();
  store.activeWorkspaceId = id;
  // Restore incoming workspace's panel state.
  loadPanelStateFromWorkspace(ws);
}

export function closeWorkspace(id: string): void {
  const ws = store.workspaces[id];
  if (!ws) return;
  if (ws.closedAt) return;
  ws.closedAt = new Date().toISOString();
  if (store.activeWorkspaceId === id) {
    store.activeWorkspaceId = pickNextOpen(id);
  }
}

export function reopenWorkspace(id: string): void {
  const ws = store.workspaces[id];
  if (!ws) return;
  ws.closedAt = null;
  ws.lastOpenedAt = new Date().toISOString();
  store.activeWorkspaceId = id;
}

function pickNextOpen(excludeId: string | null): string | null {
  for (const id of store.workspaceOrder) {
    if (id === excludeId) continue;
    const ws = store.workspaces[id];
    if (ws && !ws.closedAt) return id;
  }
  return null;
}

export function renameWorkspace(id: string, name: string): void {
  const ws = store.workspaces[id];
  if (!ws) return;
  ws.name = name;
}

export function setEditorScrollPosition(
  workspaceId: string,
  editorId: string,
  top: number,
  left: number,
): void {
  const ws = store.workspaces[workspaceId];
  if (!ws) return;
  if (!ws.editorScrollPositions) ws.editorScrollPositions = {};
  ws.editorScrollPositions[editorId] = { top, left };
}

export function getEditorScrollPosition(
  workspaceId: string,
  editorId: string,
): { top: number; left: number } | null {
  return (
    store.workspaces[workspaceId]?.editorScrollPositions?.[editorId] ?? null
  );
}

export function setEditorViewState(
  workspaceId: string,
  editorId: string,
  state: unknown,
): void {
  const ws = store.workspaces[workspaceId];
  if (!ws) return;
  if (!ws.editorViewStates) ws.editorViewStates = {};
  ws.editorViewStates[editorId] = state;
}

export function getEditorViewState(
  workspaceId: string,
  editorId: string,
): unknown {
  return store.workspaces[workspaceId]?.editorViewStates?.[editorId] ?? null;
}

/**
 * Move `fromId` to sit before/after `toId` within an ordered id array, in place.
 * No-ops when `fromId` is absent or equal to `toId`; if `toId` is missing, the
 * item is returned to its original slot. Shared by every reorder operation.
 */
function reorderInArray(
  order: string[],
  fromId: string,
  toId: string,
  position: "before" | "after",
): void {
  if (fromId === toId) return;
  const fromIndex = order.indexOf(fromId);
  if (fromIndex === -1) return;
  order.splice(fromIndex, 1);
  let toIndex = order.indexOf(toId);
  if (toIndex === -1) {
    order.splice(fromIndex, 0, fromId);
    return;
  }
  if (position === "after") toIndex += 1;
  order.splice(toIndex, 0, fromId);
}

export function reorderWorkspaces(
  fromId: string,
  toId: string,
  position: "before" | "after",
): void {
  reorderInArray(store.workspaceOrder, fromId, toId, position);
}

export function addExtraFolder(workspaceId: string, folder: string): void {
  const ws = store.workspaces[workspaceId];
  if (!ws) return;
  if (ws.folder === folder) return;
  if (!ws.extraFolders) ws.extraFolders = [];
  if (ws.extraFolders.includes(folder)) return;
  ws.extraFolders.push(folder);
}

export function removeExtraFolder(workspaceId: string, folder: string): void {
  const ws = store.workspaces[workspaceId];
  if (!ws?.extraFolders) return;
  ws.extraFolders = ws.extraFolders.filter((f) => f !== folder);
}

export function deleteWorkspace(id: string): void {
  if (!store.workspaces[id]) return;
  removeWorkspaceFromGroup(id);
  delete store.workspaces[id];
  store.workspaceOrder = store.workspaceOrder.filter((wid) => wid !== id);
  store.panelOrder = store.panelOrder.filter((pid) => pid !== id);
  if (store.activeWorkspaceId === id) {
    store.activeWorkspaceId = pickNextOpen(null);
  }
}

// ── Workspace panel groups ──────────────────────────────────────────────────
//
// Two orders cooperate:
//   • `panelOrder` — the interleaved TOP-LEVEL list (ungrouped workspace ids +
//     group ids). This is what the panel renders and what top-level drag-reorder
//     mutates, so a group can sit anywhere, even above loose workspaces.
//   • each group's `workspaceOrder` — the members inside that group, and the
//     single source of truth for membership (the reverse lookup is derived).

/** The id of the group containing `wsId`, or `undefined` when it is ungrouped. */
export function groupIdForWorkspace(wsId: string): string | undefined {
  for (const groupId of Object.keys(store.groups)) {
    if (store.groups[groupId]?.workspaceOrder.includes(wsId)) return groupId;
  }
  return undefined;
}

/**
 * Build the workspace-id → group-id reverse lookup from group membership. Pure
 * over its input so snapshot-driven consumers (the panel) can memoize it from
 * `groups` and stay reactive.
 */
export function workspaceGroupMap(
  groups: Record<string, { workspaceOrder: readonly string[] }>,
): Map<string, string> {
  const map = new Map<string, string>();
  for (const groupId of Object.keys(groups)) {
    for (const wsId of groups[groupId].workspaceOrder) map.set(wsId, groupId);
  }
  return map;
}

export function createGroup(name: string, color?: string): WorkspaceGroup {
  const id = `grp_${uuid()}`;
  const group: WorkspaceGroup = {
    id,
    name,
    collapsed: false,
    workspaceOrder: [],
    ...(color ? { color } : {}),
  };
  store.groups[id] = group;
  // A new group is a top-level entry, appended to the panel.
  store.panelOrder.push(id);
  return group;
}

export function renameGroup(id: string, name: string): void {
  const group = store.groups[id];
  if (!group) return;
  group.name = name;
}

export function deleteGroup(id: string): void {
  const group = store.groups[id];
  if (!group) return;
  // The group's members become ungrouped: splice them into the panel at the
  // group's former slot so they stay visible where the group was. Guard against
  // a member somehow already being present (invariant: a workspace is in
  // panelOrder XOR a group) so we never introduce a duplicate id.
  const idx = store.panelOrder.indexOf(id);
  const members = group.workspaceOrder.filter(
    (w) => !store.panelOrder.includes(w),
  );
  if (idx === -1) store.panelOrder.push(...members);
  else store.panelOrder.splice(idx, 1, ...members);
  delete store.groups[id];
}

/**
 * Reorder a top-level panel entry (an ungrouped workspace **or** a group) to sit
 * before/after another top-level entry. This is the single reorder for the
 * interleaved list — it drives both workspace and group repositioning.
 */
export function reorderPanel(
  fromId: string,
  toId: string,
  position: "before" | "after",
): void {
  reorderInArray(store.panelOrder, fromId, toId, position);
}

export function moveWorkspaceToGroup(
  wsId: string,
  groupId: string,
  anchor?: { toId: string; position: "before" | "after" },
): void {
  const group = store.groups[groupId];
  if (!group) return;
  removeWorkspaceFromGroup(wsId);
  // The workspace leaves the top level — it now lives inside the group.
  store.panelOrder = store.panelOrder.filter((id) => id !== wsId);
  if (!group.workspaceOrder.includes(wsId)) {
    group.workspaceOrder.push(wsId);
  }
  // Append by default; with an anchor, position relative to that row (unless it
  // is the workspace itself, which `reorderWorkspaceInGroup` would no-op).
  if (anchor && anchor.toId !== wsId) {
    reorderWorkspaceInGroup(groupId, wsId, anchor.toId, anchor.position);
  }
}

/** Remove `wsId` from `groupId`'s membership, in place. The caller supplies the
 * already-resolved group id so the reverse lookup runs at most once per drop. */
function detachMember(groupId: string, wsId: string): void {
  const group = store.groups[groupId];
  if (group) {
    group.workspaceOrder = group.workspaceOrder.filter((id) => id !== wsId);
  }
}

/** Remove `wsId` from its group's membership only (does not touch `panelOrder`). */
export function removeWorkspaceFromGroup(wsId: string): void {
  const groupId = groupIdForWorkspace(wsId);
  if (groupId) detachMember(groupId, wsId);
}

/**
 * Pull a workspace out of its group and back to the top level. It is inserted
 * into `panelOrder` just after its former group by default, or at `anchor` when
 * the caller (drag-out) knows the exact drop position. No-op if already ungrouped.
 */
export function ungroupWorkspace(
  wsId: string,
  anchor?: { toId: string; position: "before" | "after" },
): void {
  const groupId = groupIdForWorkspace(wsId);
  if (!groupId) return;
  detachMember(groupId, wsId); // reuse the id we already resolved (one lookup)
  if (!store.panelOrder.includes(wsId)) {
    const idx = store.panelOrder.indexOf(groupId);
    if (idx === -1) store.panelOrder.push(wsId);
    else store.panelOrder.splice(idx + 1, 0, wsId);
  }
  if (anchor && anchor.toId !== wsId) {
    reorderPanel(wsId, anchor.toId, anchor.position);
  }
}

export function reorderWorkspaceInGroup(
  groupId: string,
  fromId: string,
  toId: string,
  position: "before" | "after",
): void {
  const group = store.groups[groupId];
  if (!group) return;
  reorderInArray(group.workspaceOrder, fromId, toId, position);
}

export function setGroupColor(id: string, color: string | undefined): void {
  const group = store.groups[id];
  if (!group) return;
  if (color) {
    group.color = color;
  } else {
    delete group.color;
  }
}

export function toggleGroupCollapsed(id: string): void {
  const group = store.groups[id];
  if (!group) return;
  group.collapsed = !group.collapsed;
}

export function addTerminal(
  workspaceId: string,
  kind: TerminalKind,
  cwd?: string,
): TerminalRecord {
  const ws = store.workspaces[workspaceId];
  if (!ws) throw new Error(`workspace ${workspaceId} not found`);
  const id = `term_${uuid()}`;
  const title =
    kind === "claude" ? "Claude Code" : kind === "pi" ? "pi agent" : "Terminal";
  const rec: TerminalRecord = {
    id,
    sessionId: "",
    kind,
    title,
    ...(cwd ? { cwd } : {}),
  };
  ws.terminals.push(rec);
  return rec;
}

export function removeTerminal(
  workspaceId: string,
  terminalId: string,
): TerminalRecord | null {
  const ws = store.workspaces[workspaceId];
  if (!ws) return null;
  const idx = ws.terminals.findIndex((t) => t.id === terminalId);
  if (idx === -1) return null;
  const [rec] = ws.terminals.splice(idx, 1);
  return rec;
}

export function findTerminal(
  workspaceId: string,
  terminalId: string,
): TerminalRecord | null {
  return (
    store.workspaces[workspaceId]?.terminals.find((t) => t.id === terminalId) ??
    null
  );
}

/**
 * Assign (or clear) a terminal's user-given name. A non-empty name is stored as
 * {@link TerminalRecord.customName} and mirrored into `title` so it shows on the
 * tab immediately and survives reload; an empty/whitespace name clears the
 * custom name and lets the PTY-derived title take back over.
 */
export function renameTerminal(
  workspaceId: string,
  terminalId: string,
  name: string,
): void {
  const rec = findTerminal(workspaceId, terminalId);
  if (!rec) return;
  const trimmed = name.trim();
  if (trimmed) {
    rec.customName = trimmed;
    rec.title = trimmed;
  } else {
    delete rec.customName;
  }
}

export function recreateTerminal(
  workspaceId: string,
  terminalId: string,
): void {
  const rec = findTerminal(workspaceId, terminalId);
  if (!rec) return;
  rec.sessionId = "";
  rec.lastActiveAt = new Date().toISOString();
}

function baseName(p: string): string {
  const idx = p.lastIndexOf("/");
  return idx === -1 ? p : p.slice(idx + 1);
}

/** A text-mode editor record (the default mode). Diff records are excluded so a
 * diff on a path never satisfies a text-editor lookup for the same path. */
function isTextRecord(e: EditorRecord): boolean {
  return e.mode !== "diff";
}

/** A diff record matches a spec by its provider + file + (serialized) args —
 * the diff's identity, mirroring how a text editor's identity is its filePath. */
function diffMatches(
  e: EditorRecord,
  spec: { filePath: string; providerId: string; argsKey: string },
): boolean {
  return (
    e.mode === "diff" &&
    e.providerId === spec.providerId &&
    e.filePath === spec.filePath &&
    (e.args ? JSON.stringify(e.args) : "") === spec.argsKey
  );
}

/**
 * Apply an optional view-type override to a record: set it when provided, leave
 * it untouched when `undefined`. (The preview slot-reuse path resets explicitly
 * instead, since a repurposed preview must drop the prior file's view.)
 */
function applyViewType(rec: EditorRecord, viewType: string | undefined): void {
  if (viewType !== undefined) rec.viewType = viewType;
}

export function openEditor(
  workspaceId: string,
  filePath: string,
  viewType?: string,
): EditorRecord {
  const ws = store.workspaces[workspaceId];
  if (!ws) throw new Error(`workspace ${workspaceId} not found`);

  // If the file is currently open as a preview, promote it to permanent.
  const previewRec = ws.editors.find(
    (e) => isTextRecord(e) && e.filePath === filePath && e.isPreview,
  );
  if (previewRec) {
    previewRec.isPreview = false;
    applyViewType(previewRec, viewType);
    if (ws.previewEditorId === previewRec.id) ws.previewEditorId = null;
    window.dispatchEvent(
      new CustomEvent("app:activate-panel", {
        detail: { panelId: `editor:${previewRec.id}` },
      }),
    );
    return previewRec;
  }

  const existing = ws.editors.find(
    (e) => isTextRecord(e) && e.filePath === filePath,
  );
  if (existing) {
    // Reuse the tab; an explicit viewType (e.g. "Open With") switches its view
    // in place rather than opening a duplicate tab for the same file.
    applyViewType(existing, viewType);
    window.dispatchEvent(
      new CustomEvent("app:activate-panel", {
        detail: { panelId: `editor:${existing.id}` },
      }),
    );
    return existing;
  }
  const id = `ed_${uuid()}`;
  const rec: EditorRecord = { id, filePath, title: baseName(filePath) };
  applyViewType(rec, viewType);
  ws.editors.push(rec);
  return rec;
}

/**
 * Open a fresh untitled buffer. When `extension` (leading dot, e.g. ".foo") is
 * given, it's appended to the generated title so the tab reads "Untitled.foo"
 * and the extension carries into the save dialog / Monaco language. The buffer
 * still has no path until saved.
 */
export function openUntitledEditor(
  workspaceId: string,
  extension = "",
): EditorRecord {
  const ws = store.workspaces[workspaceId];
  if (!ws) throw new Error(`workspace ${workspaceId} not found`);
  const used = new Set(
    ws.editors.filter((e) => e.filePath === null).map((e) => e.title),
  );
  let n = 1;
  const titleFor = (i: number) =>
    `${i === 1 ? "Untitled" : `Untitled-${i}`}${extension}`;
  while (used.has(titleFor(n))) n += 1;
  const title = titleFor(n);
  const id = `ed_${uuid()}`;
  const rec: EditorRecord = { id, filePath: null, title };
  ws.editors.push(rec);
  return rec;
}

export function setEditorFilePath(
  workspaceId: string,
  editorId: string,
  filePath: string,
): EditorRecord | null {
  const ws = store.workspaces[workspaceId];
  if (!ws) return null;
  const rec = ws.editors.find((e) => e.id === editorId);
  if (!rec) return null;
  rec.filePath = filePath;
  rec.title = baseName(filePath);
  return rec;
}

export function removeEditor(
  workspaceId: string,
  editorId: string,
): EditorRecord | null {
  const ws = store.workspaces[workspaceId];
  if (!ws) return null;
  if (ws.previewEditorId === editorId) ws.previewEditorId = null;
  const idx = ws.editors.findIndex((e) => e.id === editorId);
  if (idx === -1) return null;
  const [rec] = ws.editors.splice(idx, 1);
  // Closing the tab discards any unsaved-edit backup it left behind.
  void clearEditorBackup(editorId);
  return rec;
}

export function findEditor(
  workspaceId: string,
  editorId: string,
): EditorRecord | null {
  return (
    store.workspaces[workspaceId]?.editors.find((e) => e.id === editorId) ??
    null
  );
}

/**
 * What to open in a diff — mirrors the SDK's `OpenDiffSpec` (state is a leaf, so
 * the shape is inlined rather than imported). Content is the named provider's
 * concern; this only owns the (serializable) record.
 */
interface DiffSpec {
  filePath: string;
  providerId: string;
  args?: Record<string, unknown>;
  title?: string;
}

/** Build a fresh diff-mode editor record from a spec. */
function newDiffRecord(spec: DiffSpec): EditorRecord {
  return {
    id: `ed_${uuid()}`,
    filePath: spec.filePath,
    title: spec.title ?? `${baseName(spec.filePath)} (diff)`,
    mode: "diff",
    providerId: spec.providerId,
    args: spec.args,
  };
}

/**
 * Open or focus a diff as a **permanent** editor tab. A diff is just an editor
 * record with `mode: "diff"`, so it shares the editor record lifecycle (preview/
 * promotion, breadcrumb, scroll persistence, the `editor:` panel id) with text
 * tabs — see ctx-domains.md → "The editor surface".
 */
export function openDiff(workspaceId: string, spec: DiffSpec): EditorRecord {
  const ws = store.workspaces[workspaceId];
  if (!ws) throw new Error(`workspace ${workspaceId} not found`);
  const argsKey = spec.args ? JSON.stringify(spec.args) : "";

  // Promote a matching preview diff to permanent (mirrors openEditor).
  const preview = ws.editors.find(
    (e) => e.isPreview && diffMatches(e, { ...spec, argsKey }),
  );
  if (preview) {
    preview.isPreview = false;
    if (ws.previewEditorId === preview.id) ws.previewEditorId = null;
    window.dispatchEvent(
      new CustomEvent("app:activate-panel", {
        detail: { panelId: `editor:${preview.id}` },
      }),
    );
    return preview;
  }

  const existing = ws.editors.find((e) => diffMatches(e, { ...spec, argsKey }));
  if (existing) {
    window.dispatchEvent(
      new CustomEvent("app:activate-panel", {
        detail: { panelId: `editor:${existing.id}` },
      }),
    );
    return existing;
  }

  const rec = newDiffRecord(spec);
  ws.editors.push(rec);
  return rec;
}

/**
 * Open a diff as a temporary **preview** tab (single-click style), the diff
 * counterpart of {@link openPreviewEditor}. Reuses the workspace's single
 * preview slot — mutating it in place so the tab stays put — and promotes on the
 * same interactions text previews do.
 */
export function openPreviewDiff(
  workspaceId: string,
  spec: DiffSpec,
): EditorRecord {
  const ws = store.workspaces[workspaceId];
  if (!ws) throw new Error(`workspace ${workspaceId} not found`);
  const argsKey = spec.args ? JSON.stringify(spec.args) : "";

  // Already permanently open → activate.
  const permanent = ws.editors.find(
    (e) => !e.isPreview && diffMatches(e, { ...spec, argsKey }),
  );
  if (permanent) {
    window.dispatchEvent(
      new CustomEvent("app:activate-panel", {
        detail: { panelId: `editor:${permanent.id}` },
      }),
    );
    return permanent;
  }

  // Already the current preview (same diff) → activate.
  const currentPreview = ws.previewEditorId
    ? (ws.editors.find((e) => e.id === ws.previewEditorId) ?? null)
    : null;
  if (currentPreview && diffMatches(currentPreview, { ...spec, argsKey })) {
    window.dispatchEvent(
      new CustomEvent("app:activate-panel", {
        detail: { panelId: `editor:${currentPreview.id}` },
      }),
    );
    return currentPreview;
  }

  const title = spec.title ?? `${baseName(spec.filePath)} (diff)`;

  // Reuse the existing preview slot (whatever mode it was) for this diff.
  if (currentPreview) {
    currentPreview.filePath = spec.filePath;
    currentPreview.title = title;
    currentPreview.mode = "diff";
    currentPreview.providerId = spec.providerId;
    currentPreview.args = spec.args;
    window.dispatchEvent(
      new CustomEvent("app:update-preview-title", {
        detail: { editorId: currentPreview.id, title },
      }),
    );
    window.dispatchEvent(
      new CustomEvent("app:activate-panel", {
        detail: { panelId: `editor:${currentPreview.id}` },
      }),
    );
    return currentPreview;
  }

  // Create a fresh preview diff record.
  const rec = { ...newDiffRecord(spec), isPreview: true };
  ws.editors.push(rec);
  ws.previewEditorId = rec.id;
  return rec;
}

/**
 * Open a file as a temporary preview tab (VS Code-style single-click behavior).
 *
 * Rules:
 * - If the file is already permanently open → just activate it.
 * - If the file is already the current preview → just activate it.
 * - If there is an existing preview → reuse its slot (mutate filePath/title in
 *   place so the tab stays in the same position) and fire
 *   "app:update-preview-title" so CenterDock can update the dockview panel
 *   title.
 * - Otherwise → create a new preview editor record.
 */
export function openPreviewEditor(
  workspaceId: string,
  filePath: string,
  viewType?: string,
): EditorRecord {
  const ws = store.workspaces[workspaceId];
  if (!ws) throw new Error(`workspace ${workspaceId} not found`);

  // Already permanently open → activate.
  const permanent = ws.editors.find(
    (e) => isTextRecord(e) && e.filePath === filePath && !e.isPreview,
  );
  if (permanent) {
    applyViewType(permanent, viewType);
    window.dispatchEvent(
      new CustomEvent("app:activate-panel", {
        detail: { panelId: `editor:${permanent.id}` },
      }),
    );
    return permanent;
  }

  // Already the current preview → activate.
  const currentPreview = ws.previewEditorId
    ? ws.editors.find((e) => e.id === ws.previewEditorId)
    : null;
  if (
    currentPreview &&
    isTextRecord(currentPreview) &&
    currentPreview.filePath === filePath
  ) {
    applyViewType(currentPreview, viewType);
    window.dispatchEvent(
      new CustomEvent("app:activate-panel", {
        detail: { panelId: `editor:${currentPreview.id}` },
      }),
    );
    return currentPreview;
  }

  // Reuse the existing preview slot (whatever mode it was) for this text file.
  // Always reset the chosen view so a previously-previewed file's viewType
  // doesn't leak onto this one.
  if (currentPreview) {
    currentPreview.filePath = filePath;
    currentPreview.title = baseName(filePath);
    currentPreview.mode = "text";
    delete currentPreview.providerId;
    delete currentPreview.args;
    if (viewType !== undefined) currentPreview.viewType = viewType;
    else delete currentPreview.viewType;
    window.dispatchEvent(
      new CustomEvent("app:update-preview-title", {
        detail: { editorId: currentPreview.id, title: currentPreview.title },
      }),
    );
    window.dispatchEvent(
      new CustomEvent("app:activate-panel", {
        detail: { panelId: `editor:${currentPreview.id}` },
      }),
    );
    return currentPreview;
  }

  // Create a fresh preview record.
  const id = `ed_${uuid()}`;
  const rec: EditorRecord = {
    id,
    filePath,
    title: baseName(filePath),
    isPreview: true,
  };
  applyViewType(rec, viewType);
  ws.editors.push(rec);
  ws.previewEditorId = id;
  return rec;
}

/**
 * Promote a preview editor to a permanent tab (no longer replaced on next
 * single-click open).
 */
export function promotePreviewEditor(
  workspaceId: string,
  editorId: string,
): void {
  const ws = store.workspaces[workspaceId];
  if (!ws) return;
  const rec = ws.editors.find((e) => e.id === editorId);
  if (!rec) return;
  rec.isPreview = false;
  if (ws.previewEditorId === editorId) ws.previewEditorId = null;
}

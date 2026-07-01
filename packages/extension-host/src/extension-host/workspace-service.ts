import { subscribe, snapshot } from "valtio";
import { store } from "../state/store";
import {
  activateWorkspace,
  addExtraFolder,
  closeWorkspace,
  createWorkspace,
  deleteWorkspace,
  pickFolderAndCreateWorkspace,
  removeExtraFolder,
  renameWorkspace,
  reopenWorkspace,
  reorderWorkspaces,
} from "../state/workspaces";
import type {
  Workspace,
  WorkspaceState,
  WorkspaceService,
  WorkspaceStatusProvider,
  WorkspaceSectionProvider,
  WorkspaceBadgeProvider,
} from "@silo-code/sdk";
import { workspaceStatusRegistry } from "./workspace-status-registry";
import { workspaceSectionRegistry } from "./workspace-section-registry";
import { workspaceBadgeRegistry } from "./workspace-badge-registry";

// `ctx.workspaces` — the public contract lives in @silo-code/sdk
// (workspace-service.ts); this is the host implementation.

let cachedSnapshot: WorkspaceState | null = null;

function buildSnapshot(): WorkspaceState {
  const s = snapshot(store);
  const ordered = s.workspaceOrder
    .map((id) => s.workspaces[id])
    .filter((ws): ws is NonNullable<typeof ws> => Boolean(ws))
    .map((ws) => ws as unknown as Workspace);
  const open: Workspace[] = [];
  const closed: Workspace[] = [];
  for (const ws of ordered) {
    if (ws.closedAt) closed.push(ws);
    else open.push(ws);
  }
  closed.sort((a, b) => {
    const at = a.closedAt ?? "";
    const bt = b.closedAt ?? "";
    return bt.localeCompare(at);
  });

  // Early return cached snapshot if nothing changed (prevents infinite loop
  // in useSyncExternalStore, which calls getState on every render).
  if (
    cachedSnapshot &&
    cachedSnapshot.activeId === s.activeWorkspaceId &&
    cachedSnapshot.hydrated === s.hydrated &&
    cachedSnapshot.all.length === ordered.length &&
    cachedSnapshot.open.length === open.length &&
    cachedSnapshot.closed.length === closed.length &&
    cachedSnapshot.all.every((ws, i) => ws === ordered[i])
  ) {
    return cachedSnapshot;
  }

  const next = Object.freeze({
    all: Object.freeze(ordered),
    open: Object.freeze(open),
    closed: Object.freeze(closed),
    activeId: s.activeWorkspaceId,
    hydrated: s.hydrated,
  });
  cachedSnapshot = next;
  return next;
}

let service: WorkspaceService | null = null;

/** @internal — host factory; extensions receive this as `ctx.workspaces`. */
export function getWorkspaceService(): WorkspaceService {
  if (service) return service;
  service = {
    getState: buildSnapshot,
    subscribe(listener) {
      const unsub = subscribe(store, () => listener(buildSnapshot()));
      return { dispose: unsub };
    },
    get: (id) =>
      snapshot(store).workspaces[id] as unknown as Workspace | undefined,
    createFromFolderPicker: () => pickFolderAndCreateWorkspace(),
    create: (input) => createWorkspace(input),
    rename: renameWorkspace,
    reorder: reorderWorkspaces,
    activate: activateWorkspace,
    close: closeWorkspace,
    reopen: reopenWorkspace,
    addFolder: addExtraFolder,
    removeFolder: removeExtraFolder,
    delete: deleteWorkspace,
    registerStatus(provider: WorkspaceStatusProvider) {
      return workspaceStatusRegistry.register(provider);
    },
    getStatus: workspaceStatusRegistry.getStatus.bind(workspaceStatusRegistry),
    invalidateStatus: workspaceStatusRegistry.invalidate.bind(
      workspaceStatusRegistry,
    ),
    subscribeStatus: workspaceStatusRegistry.subscribe.bind(
      workspaceStatusRegistry,
    ),
    registerSection(provider: WorkspaceSectionProvider) {
      return workspaceSectionRegistry.register(provider);
    },
    subscribeSection: workspaceSectionRegistry.subscribe.bind(
      workspaceSectionRegistry,
    ),
    registerBadge(provider: WorkspaceBadgeProvider) {
      return workspaceBadgeRegistry.register(provider);
    },
    getBadges: workspaceBadgeRegistry.getBadges.bind(workspaceBadgeRegistry),
    invalidateBadges: workspaceBadgeRegistry.invalidate.bind(
      workspaceBadgeRegistry,
    ),
    subscribeBadges: workspaceBadgeRegistry.subscribe.bind(
      workspaceBadgeRegistry,
    ),
  };
  return service;
}

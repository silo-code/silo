import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useSnapshot } from "valtio";
import { FolderOpen } from "@phosphor-icons/react";
import { store } from "../state/store";
import { partitionSavedEntries } from "../state/partition-saved-entries";
import { getWorkspaceService } from "../extension-host/workspace-service";
import { openMenu } from "../extension-host/menu-controller";
import { executeCommand } from "../extension-host/commands";
import { WorkspaceDock } from "./WorkspaceDock";
import {
  buildOpenWorkspaceItems,
  useFolderExistence,
} from "./open-workspace-menu";
import { installDockFocusTracking } from "./dock-focus-tracking";
import "dockview/dist/styles/dockview.css";
import "./CenterDock.css";

installDockFocusTracking();

export function CenterDock() {
  const snap = useSnapshot(store);
  const activeId = snap.activeWorkspaceId;
  const wsService = getWorkspaceService();
  const wsState = useSyncExternalStore((cb) => {
    const sub = wsService.subscribe(cb);
    return () => sub.dispose();
  }, wsService.getState);
  // Closed ("existing") workspaces / groups — the empty-state CTA always opens
  // the same Saved / New workspace / New Group menu as the workspaces panel
  // add button; the button label flips based on whether anything is reopenable.
  const savedEntries = useMemo(
    () => partitionSavedEntries(wsState.closed, snap.groups),
    [wsState.closed, snap.groups],
  );
  const closedFolders = useMemo(
    () => savedEntries.workspaces.map((ws) => ws.folder),
    [savedEntries.workspaces],
  );
  const folderExistence = useFolderExistence(closedFolders);
  const ctaRef = useRef<HTMLButtonElement | null>(null);
  const [warmedIds, setWarmedIds] = useState<Set<string>>(() =>
    activeId ? new Set([activeId]) : new Set(),
  );
  const hasExisting =
    savedEntries.workspaces.length > 0 || savedEntries.groupEntries.length > 0;

  function createWorkspace() {
    wsService
      .createFromFolderPicker()
      .catch((err) => console.error("create workspace failed", err));
  }

  function openWorkspaceMenu() {
    const items = buildOpenWorkspaceItems({
      closed: savedEntries.workspaces,
      closedGroups: savedEntries.groupEntries,
      folderExistence,
      onNew: createWorkspace,
      onNewGroup: () => {
        executeCommand("workspace.newGroup");
      },
    });
    void openMenu({ items, anchor: ctaRef.current });
  }

  useEffect(() => {
    if (!activeId) return;
    setWarmedIds((prev) => {
      if (prev.has(activeId)) return prev;
      const next = new Set(prev);
      next.add(activeId);
      return next;
    });
  }, [activeId]);

  if (!activeId) {
    return (
      <div className="panel-body center-body">
        <div className="center-empty">
          <div className="center-empty-card">
            <div className="center-empty-mark" aria-hidden="true" />
            <h1 className="center-empty-title">
              {hasExisting ? "Open a Workspace" : "Start a new Workspace"}
            </h1>
            <p className="center-empty-sub">
              Open a folder to start editing files, running terminals, and
              reviewing diffs — all side by side.
            </p>
            <button
              ref={ctaRef}
              className="center-empty-cta silo-button-primary"
              type="button"
              onClick={openWorkspaceMenu}
            >
              <FolderOpen weight="bold" size={15} />
              <span>{hasExisting ? "Open workspace" : "Add workspace"}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel-body center-body">
      {Array.from(warmedIds).map((wsId) =>
        snap.workspaces[wsId] ? (
          <div
            key={wsId}
            className="dock-host"
            data-active={wsId === activeId ? "true" : "false"}
          >
            <WorkspaceDock workspaceId={wsId} active={wsId === activeId} />
          </div>
        ) : null,
      )}
    </div>
  );
}

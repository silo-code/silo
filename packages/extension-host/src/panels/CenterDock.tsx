import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useSnapshot } from "valtio";
import { SquaresFour, FolderOpen } from "@phosphor-icons/react";
import { store } from "../state/store";
import { getWorkspaceService } from "../extension-host/workspace-service";
import { openMenu } from "../extension-host/menu-controller";
import { WorkspaceDock } from "./WorkspaceDock";
import {
  buildOpenWorkspaceItems,
  useFolderExistence,
} from "./open-workspace-menu";
import "dockview/dist/styles/dockview.css";
import "./CenterDock.css";

export function CenterDock() {
  const snap = useSnapshot(store);
  const activeId = snap.activeWorkspaceId;
  const wsService = getWorkspaceService();
  const wsState = useSyncExternalStore((cb) => {
    const sub = wsService.subscribe(cb);
    return () => sub.dispose();
  }, wsService.getState);
  // Closed ("existing") workspaces — when any exist, the empty-state CTA opens
  // the reopen/new menu instead of going straight to the folder picker.
  const closed = wsState.closed;
  const closedFolders = useMemo(() => closed.map((ws) => ws.folder), [closed]);
  const folderExistence = useFolderExistence(closedFolders);
  const ctaRef = useRef<HTMLButtonElement | null>(null);
  const [warmedIds, setWarmedIds] = useState<Set<string>>(() =>
    activeId ? new Set([activeId]) : new Set(),
  );

  function createWorkspace() {
    wsService
      .createFromFolderPicker()
      .catch((err) => console.error("create workspace failed", err));
  }

  function openWorkspaceMenu() {
    const items = buildOpenWorkspaceItems({
      closed,
      folderExistence,
      onNew: createWorkspace,
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
    const hasExisting = closed.length > 0;
    return (
      <div className="panel-body center-body">
        <div className="center-empty">
          <div className="center-empty-card">
            <div className="center-empty-mark">
              <SquaresFour weight="duotone" size={30} />
            </div>
            <h1 className="center-empty-title">No workspace open</h1>
            <p className="center-empty-sub">
              Open a folder to start editing files, running terminals, and
              reviewing diffs — all side by side.
            </p>
            <button
              ref={ctaRef}
              className="center-empty-cta silo-button-primary"
              type="button"
              onClick={hasExisting ? openWorkspaceMenu : createWorkspace}
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

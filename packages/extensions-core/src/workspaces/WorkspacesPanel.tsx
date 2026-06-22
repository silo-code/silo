import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, SquaresFour } from "@phosphor-icons/react";
import {
  useFocusGroup,
  useServiceState,
  type ExtensionContext,
  type MenuEntry,
  type WorkspaceStatusRow,
} from "@silo-code/sdk";
import { homeDir } from "@silo-code/extension-host/internal";
import {
  fullPath,
  FrontTruncatedPath,
  formatElapsed,
  useNow,
  useFolderExistence,
  type Workspace,
  type DropTarget,
} from "./workspace-helpers";
import { buildAddWorkspaceItems } from "./workspace-add-menu";
import { openWorkspaceProperties } from "./workspace-properties";
import "./WorkspacesPanel.css";

const WorkspaceIcon = SquaresFour;

function WorkspaceStatusRows({ rows }: { rows: WorkspaceStatusRow[] }) {
  if (rows.length === 0) return null;
  return (
    <>
      {rows.map((row) => (
        <div key={row.id} className="ws-status-row">
          <span
            className="ws-status-dot"
            data-status={row.status ?? "none"}
            aria-hidden="true"
          />
          <span className="ws-status-label">{row.label}</span>
          {row.startedAt && (
            <span className="ws-status-elapsed">
              {formatElapsed(row.startedAt)}
            </span>
          )}
        </div>
      ))}
    </>
  );
}

export function WorkspacesPanel({ ctx }: { ctx: ExtensionContext }) {
  const service = ctx.workspaces;
  const snap = useServiceState(service);
  const [home, setHome] = useState("");
  // Re-render when decoration providers invalidate their data.
  const [, setDecorationTick] = useState(0);
  useEffect(() => {
    return service.subscribeDecorations(() => setDecorationTick((t) => t + 1))
      .dispose;
  }, [service]);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const addWrapRef = useRef<HTMLDivElement | null>(null);
  useNow();

  useEffect(() => {
    homeDir()
      .then(setHome)
      .catch(() => {});
  }, []);

  const activeIndex = snap.open.findIndex((w) => w.id === snap.activeId);

  // Roving keyboard focus, the WebKit-safe ring, and the single Tab stop are all
  // owned by useFocusGroup: the list is one Tab stop, arrows move between rows,
  // Enter activates, and the ContextMenu key / Shift+F10 opens the row's menu.
  // Entry parks on the selected workspace (`start`); the host's "first tabbable"
  // lands there on click / region cycle.
  const group = useFocusGroup({
    count: snap.open.length,
    start: activeIndex >= 0 ? activeIndex : 0,
    onActivate: (i) => service.activate(snap.open[i].id),
    onMenu: (i, anchor) => openWorkspaceMenu(snap.open[i], { anchor }),
  });

  const closedFolders = useMemo(
    () => snap.closed.map((ws) => ws.folder),
    [snap.closed],
  );
  const folderExistence = useFolderExistence(closedFolders, ctx.files);

  async function onNew() {
    try {
      await service.createFromFolderPicker();
    } catch (err) {
      console.error("create workspace failed", err);
    }
  }

  function openClosedMenu() {
    const items = buildAddWorkspaceItems({
      ctx,
      closed: snap.closed,
      folderExistence,
      onNew,
    });
    void ctx.ui.showMenu({ items, anchor: addWrapRef.current });
  }

  function workspaceMenuItems(ws: Workspace): MenuEntry[] {
    const items: MenuEntry[] = [
      {
        label: "Properties…",
        run: () => openWorkspaceProperties(ctx, home, ws),
      },
    ];
    if (!ws.closedAt) {
      items.push({ label: "Close", run: () => service.close(ws.id) });
    }
    return items;
  }

  /**
   * Open the workspace context menu — at the cursor for a right-click, or
   * anchored to the row when invoked from the keyboard (the ContextMenu key /
   * Shift+F10). `toggle: false` so a stray duplicate event re-opens rather than
   * toggling it shut.
   */
  function openWorkspaceMenu(
    ws: Workspace,
    placement: { at?: { x: number; y: number }; anchor?: HTMLElement | null },
  ) {
    void ctx.ui.showMenu({
      items: workspaceMenuItems(ws),
      toggle: false,
      ...placement,
    });
  }

  function onDragStart(e: React.DragEvent<HTMLLIElement>, id: string) {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/x-workspace-id", id);
  }

  function onDragOver(e: React.DragEvent<HTMLLIElement>, targetId: string) {
    if (!draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggingId === targetId) {
      if (dropTarget) setDropTarget(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const position =
      e.clientY < rect.top + rect.height / 2 ? "before" : "after";
    if (dropTarget?.id !== targetId || dropTarget.position !== position) {
      setDropTarget({ id: targetId, position });
    }
  }

  function onDrop(e: React.DragEvent<HTMLLIElement>, targetId: string) {
    e.preventDefault();
    if (draggingId && dropTarget && draggingId !== targetId) {
      service.reorder(draggingId, dropTarget.id, dropTarget.position);
    }
    setDraggingId(null);
    setDropTarget(null);
  }

  function onDragEnd() {
    setDraggingId(null);
    setDropTarget(null);
  }

  return (
    <>
      <div className="panel-body workspaces-body">
        {!snap.hydrated && <div className="placeholder">Loading…</div>}
        {snap.hydrated && snap.open.length > 0 && (
          <ul
            className="ws-list"
            role="listbox"
            aria-label="Open workspaces"
            {...group.containerProps}
          >
            {snap.open.map((ws, i) => {
              const isDragging = draggingId === ws.id;
              const isDropBefore =
                dropTarget?.id === ws.id && dropTarget.position === "before";
              const isDropAfter =
                dropTarget?.id === ws.id && dropTarget.position === "after";
              const classes = [
                "ws-item",
                snap.activeId === ws.id ? "active" : "",
                isDragging ? "dragging" : "",
                isDropBefore ? "drop-before" : "",
                isDropAfter ? "drop-after" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return (
                <li
                  key={ws.id}
                  className={classes}
                  role="option"
                  aria-selected={snap.activeId === ws.id}
                  {...group.getItemProps(i)}
                  draggable
                  onDragStart={(e) => onDragStart(e, ws.id)}
                  onDragOver={(e) => onDragOver(e, ws.id)}
                  onDrop={(e) => onDrop(e, ws.id)}
                  onDragEnd={onDragEnd}
                  onClick={() => service.activate(ws.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    // Right-click opens at the cursor; a keyboard-invoked
                    // contextmenu (button !== 2) anchors to the row instead.
                    if (e.button === 2) {
                      openWorkspaceMenu(ws, {
                        at: { x: e.clientX, y: e.clientY },
                      });
                    } else {
                      openWorkspaceMenu(ws, { anchor: e.currentTarget });
                    }
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    void openWorkspaceProperties(ctx, home, ws);
                  }}
                  title="Right-click for menu · Double-click for properties"
                >
                  <WorkspaceIcon
                    className="ws-icon"
                    size={20}
                    weight="duotone"
                  />
                  <div className="ws-name-row">
                    <span className="ws-name">{ws.name}</span>
                    <span className="ws-uptime">
                      {formatElapsed(ws.createdAt)}
                    </span>
                  </div>
                  <div className="ws-folder" title={ws.folder}>
                    <FrontTruncatedPath
                      className="ws-folder-path"
                      text={fullPath(ws.folder, home)}
                    />
                    {(ws.extraFolders?.length ?? 0) > 0 && (
                      <span className="ws-folder-extra-count">
                        +{ws.extraFolders!.length}
                      </span>
                    )}
                  </div>
                  <WorkspaceStatusRows rows={service.getDecorations(ws.id)} />
                  <button
                    className="ws-close"
                    title="Close workspace"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation();
                      service.close(ws.id);
                    }}
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {snap.hydrated && (
          <div className="ws-add-wrap" ref={addWrapRef}>
            <button
              className="ws-add-btn"
              type="button"
              onClick={openClosedMenu}
              title="Add workspace"
              aria-label="Add workspace"
            >
              <Plus weight="bold" size={14} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

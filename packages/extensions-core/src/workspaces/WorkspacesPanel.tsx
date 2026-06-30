import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CaretRight, Plus, SquaresFour } from "@phosphor-icons/react";
import { useSnapshot } from "valtio";
import {
  store,
  createGroup,
  deleteGroup,
  moveWorkspaceToGroup,
  removeWorkspaceFromGroup,
  toggleGroupCollapsed,
  workspaceGroupMap,
} from "@silo-code/extension-host/internal";
import {
  Tooltip,
  useFocusGroup,
  useServiceState,
  type ExtensionContext,
  type MenuEntry,
  type WorkspaceStatusRow,
} from "@silo-code/sdk";
import {
  homeDir,
  workspaceSectionRegistry,
} from "@silo-code/extension-host/internal";
import {
  fullPath,
  FrontTruncatedPath,
  formatElapsed,
  useNow,
  useFolderExistence,
  type Workspace,
} from "./workspace-helpers";
import { buildAddWorkspaceItems } from "./workspace-add-menu";
import { openWorkspaceProperties } from "./workspace-properties";
import { openGroupProperties, type GroupSnapshot } from "./group-properties";
import { useWorkspaceDnd } from "./use-workspace-dnd";
import "./WorkspacesPanel.css";

const WorkspaceIcon = SquaresFour;

// homeDir() is resolved once at module load and cached. Using a module-level
// cache means WorkspacesPanel remounts (which happen when the column layout
// switches between single-pane and split-pane on workspace activation) read
// the already-resolved value instead of restarting the async load, preventing
// the flash of the full absolute path before tilde-substitution is ready.
let _home = "";
const _homeListeners = new Set<() => void>();
homeDir()
  .then((h) => {
    _home = h;
    _homeListeners.forEach((fn) => fn());
  })
  .catch(() => {});

function subscribeHome(onChange: () => void): () => void {
  _homeListeners.add(onChange);
  return () => {
    _homeListeners.delete(onChange);
  };
}

function getHome(): string {
  return _home;
}

function useHomeDir(): string {
  return useSyncExternalStore(subscribeHome, getHome);
}

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
  const storeSnap = useSnapshot(store);
  const home = useHomeDir();
  // Re-render when status providers invalidate their data.
  const [, setStatusTick] = useState(0);
  useEffect(() => {
    return service.subscribeStatus(() => setStatusTick((t) => t + 1)).dispose;
  }, [service]);
  // Re-render when section providers are registered or unregistered.
  const [, setSectionTick] = useState(0);
  useEffect(() => {
    return service.subscribeSection(() => setSectionTick((t) => t + 1)).dispose;
  }, [service]);
  // Re-render when badge providers invalidate their data.
  const [, setBadgeTick] = useState(0);
  useEffect(() => {
    return service.subscribeBadges(() => setBadgeTick((t) => t + 1)).dispose;
  }, [service]);

  const addWrapRef = useRef<HTMLDivElement | null>(null);
  useNow();

  // All drag-and-drop state + wiring (workspace rows and group headers) lives
  // in the hook; the panel just spreads its prop getters onto the elements.
  const dnd = useWorkspaceDnd(service);

  // Reverse lookup (workspace id → group id), derived from group membership —
  // the groups' `workspaceOrder` is the single source of truth.
  const groupMap = useMemo(
    () => workspaceGroupMap(storeSnap.groups, storeSnap.groupOrder),
    [storeSnap.groups, storeSnap.groupOrder],
  );

  // Partition open workspaces into ungrouped (shown at top) and the rest
  // (shown inside their groups below).
  const ungrouped = useMemo(
    () => snap.open.filter((ws) => !groupMap.has(ws.id)),
    [snap.open, groupMap],
  );

  // O(1) lookup for workspaces by id (for group body rendering).
  const openById = useMemo(
    () => new Map(snap.open.map((ws) => [ws.id, ws])),
    [snap.open],
  );

  const activeIndex = ungrouped.findIndex((w) => w.id === snap.activeId);

  // Roving keyboard focus covers ungrouped workspaces only (v1).
  const roving = useFocusGroup({
    count: ungrouped.length,
    start: activeIndex >= 0 ? activeIndex : 0,
    onActivate: (i) => service.activate(ungrouped[i].id),
    onMenu: (i, anchor) => openWorkspaceMenu(ungrouped[i], { anchor }),
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

  function onNewGroup() {
    void ctx.ui
      .prompt({ title: "New Group", label: "Name" })
      .then((name) => {
        if (name?.trim()) createGroup(name.trim());
      });
  }

  function openClosedMenu() {
    const items = buildAddWorkspaceItems({
      ctx,
      closed: snap.closed,
      folderExistence,
      onNew,
      onNewGroup,
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

    // Group membership actions
    const currentGroupId = groupMap.get(ws.id);
    if (currentGroupId) {
      items.push({
        label: "Remove from Group",
        run: () => removeWorkspaceFromGroup(ws.id),
      });
    } else if (storeSnap.groupOrder.length > 0) {
      items.push({
        label: "Move to Group",
        submenu: storeSnap.groupOrder
          .map((groupId) => storeSnap.groups[groupId])
          .filter(Boolean)
          .map((group) => ({
            label: group.name,
            run: () => moveWorkspaceToGroup(ws.id, group.id),
          })),
      });
    }

    if (!ws.closedAt) {
      items.push({ label: "Close", run: () => service.close(ws.id) });
    }
    return items;
  }

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

  function openGroupMenu(
    group: GroupSnapshot,
    placement: { at?: { x: number; y: number }; anchor?: HTMLElement | null },
  ) {
    void ctx.ui.showMenu({
      items: [
        {
          label: "Properties…",
          run: () => void openGroupProperties(ctx, group),
        },
        {
          label: "Delete Group",
          run: () => deleteGroup(group.id),
        },
      ],
      toggle: false,
      ...placement,
    });
  }

  // ── Workspace item renderer (shared by ungrouped + group body) ───────────

  function renderWorkspaceItem(ws: Workspace, i: number, groupId?: string) {
    const edge = dnd.dropEdge(ws.id);
    const classes = [
      "ws-item",
      snap.activeId === ws.id ? "active" : "",
      dnd.isDragging(ws.id) ? "dragging" : "",
      edge === "before" ? "drop-before" : "",
      edge === "after" ? "drop-after" : "",
    ]
      .filter(Boolean)
      .join(" ");

    // useFocusGroup props only apply to ungrouped items
    const focusProps = groupId === undefined ? roving.getItemProps(i) : {};

    return (
      <li
        key={ws.id}
        className={classes}
        role="option"
        aria-selected={snap.activeId === ws.id}
        {...focusProps}
        {...dnd.workspaceProps(ws.id, groupId)}
        onClick={() => service.activate(ws.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          if (e.button === 2) {
            openWorkspaceMenu(ws, { at: { x: e.clientX, y: e.clientY } });
          } else {
            openWorkspaceMenu(ws, { anchor: e.currentTarget });
          }
        }}
        onDoubleClick={(e) => {
          e.stopPropagation();
          void openWorkspaceProperties(ctx, home, ws);
        }}
      >
        <WorkspaceIcon className="ws-icon" size={20} weight="duotone" />
        <div className="ws-name-row">
          <Tooltip content="Right-click for menu · Double-click for properties">
            <span className="ws-name">{ws.name}</span>
          </Tooltip>
          {service.getBadges(ws.id).map((b) => (
            <span
              key={b.id}
              className="ws-badge"
              style={
                b.color ? { color: b.color, borderColor: b.color } : undefined
              }
            >
              {b.text}
            </span>
          ))}
        </div>
        <div className="ws-folder">
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
        <WorkspaceStatusRows rows={service.getStatus(ws.id)} />
        <div className="ws-sections">
          {workspaceSectionRegistry.list().map((p) => {
            const Comp = p.component;
            return <Comp key={p.id} workspaceId={ws.id} />;
          })}
        </div>
        <Tooltip content="Close workspace">
          <button
            className="ws-close"
            tabIndex={-1}
            onClick={(e) => {
              e.stopPropagation();
              service.close(ws.id);
            }}
          >
            ×
          </button>
        </Tooltip>
      </li>
    );
  }

  return (
    <>
      <div className="panel-body workspaces-body">
        {!snap.hydrated && <div className="placeholder">Loading…</div>}
        {snap.hydrated && (snap.open.length > 0 || storeSnap.groupOrder.length > 0) && (
          <ul
            className="ws-list"
            role="listbox"
            aria-label="Open workspaces"
            {...roving.containerProps}
          >
            {/* Ungrouped open workspaces */}
            {ungrouped.map((ws, i) => renderWorkspaceItem(ws, i))}

            {/* Groups */}
            {storeSnap.groupOrder.map((groupId) => {
              const group = storeSnap.groups[groupId];
              if (!group) return null;

              const groupEdge = dnd.groupDropEdge(group.id);
              const headerClasses = [
                "ws-group-header",
                dnd.isGroupDragging(group.id) ? "dragging" : "",
                groupEdge === "before" ? "drop-before" : "",
                groupEdge === "after" ? "drop-after" : "",
              ]
                .filter(Boolean)
                .join(" ");

              const colorStyle = group.color
                ? ({ "--ws-group-color": group.color } as React.CSSProperties)
                : undefined;

              return (
                <li
                  key={group.id}
                  className={`ws-group${group.color ? " ws-group--colored" : ""}`}
                  style={colorStyle}
                >
                  <div
                    className={headerClasses}
                    {...dnd.groupProps(group.id)}
                    onClick={() => toggleGroupCollapsed(group.id)}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      void openGroupProperties(ctx, group);
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (e.button === 2) {
                        openGroupMenu(group, {
                          at: { x: e.clientX, y: e.clientY },
                        });
                      } else {
                        openGroupMenu(group, {
                          anchor: e.currentTarget,
                        });
                      }
                    }}
                  >
                    <CaretRight
                      className={`ws-group-caret${group.collapsed ? "" : " expanded"}`}
                      size={12}
                      weight="bold"
                    />
                    <span className="ws-group-name">{group.name}</span>
                  </div>
                  {!group.collapsed && (
                    <ul className="ws-group-body">
                      {group.workspaceOrder.map((wsId) => {
                        const ws = openById.get(wsId);
                        if (!ws) return null;
                        return renderWorkspaceItem(ws, 0, group.id);
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {snap.hydrated && (
          <div className="ws-add-wrap" ref={addWrapRef}>
            <Tooltip content="Add workspace">
              <button
                className="ws-add-btn"
                type="button"
                onClick={openClosedMenu}
                aria-label="Add workspace"
              >
                <Plus weight="bold" size={14} />
              </button>
            </Tooltip>
          </div>
        )}
      </div>
    </>
  );
}

import React, { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CaretRight, Plus, SquaresFour } from "@phosphor-icons/react";
import { useSnapshot } from "valtio";
import {
  store,
  createGroup,
  deleteGroup,
  moveWorkspaceToGroup,
  ungroupWorkspace,
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

  // All drag-and-drop state + wiring lives in the hook; the panel just spreads
  // its prop getters onto the entries.
  const dnd = useWorkspaceDnd();

  // O(1) lookup for open workspaces by id.
  const openById = useMemo(
    () => new Map(snap.open.map((ws) => [ws.id, ws])),
    [snap.open],
  );

  // Reverse lookup (workspace id → group id), derived from group membership.
  const groupMap = useMemo(
    () => workspaceGroupMap(storeSnap.groups),
    [storeSnap.groups],
  );

  // Top-level ungrouped *open* workspaces, in panel order — the set the roving
  // keyboard focus covers (groups aren't keyboard-reorderable yet, v1).
  const topLevelWsIds = useMemo(
    () =>
      storeSnap.panelOrder.filter(
        (id) => !storeSnap.groups[id] && openById.has(id),
      ),
    [storeSnap.panelOrder, storeSnap.groups, openById],
  );
  const rovingIndex = useMemo(
    () => new Map(topLevelWsIds.map((id, i) => [id, i])),
    [topLevelWsIds],
  );

  // First / last *rendered* top-level entries — the anchors for the background
  // catch-all zone (drop above the first → beginning, below the last → end).
  const renderedEntryIds = useMemo(
    () =>
      storeSnap.panelOrder.filter(
        (id) => storeSnap.groups[id] || openById.has(id),
      ),
    [storeSnap.panelOrder, storeSnap.groups, openById],
  );
  const firstEntryId = renderedEntryIds[0] ?? null;
  const lastEntryId = renderedEntryIds[renderedEntryIds.length - 1] ?? null;

  const activeIndex = snap.activeId ? rovingIndex.get(snap.activeId) ?? -1 : -1;

  const roving = useFocusGroup({
    count: topLevelWsIds.length,
    start: activeIndex >= 0 ? activeIndex : 0,
    onActivate: (i) => service.activate(topLevelWsIds[i]),
    onMenu: (i, anchor) => {
      const ws = openById.get(topLevelWsIds[i]);
      if (ws) openWorkspaceMenu(ws, { anchor });
    },
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
    const groups = storeSnap.panelOrder
      .map((id) => storeSnap.groups[id])
      .filter(Boolean);
    if (currentGroupId) {
      items.push({
        label: "Remove from Group",
        run: () => ungroupWorkspace(ws.id),
      });
    } else if (groups.length > 0) {
      items.push({
        label: "Move to Group",
        submenu: groups.map((group) => ({
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

  // ── Workspace item renderer (shared by top-level + group body) ────────────
  // `groupId` undefined → a top-level entry (keyboard-focusable, `i` is its
  // roving index); otherwise a row inside that group.

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

  function renderGroupCard(group: GroupSnapshot) {
    const edge = dnd.dropEdge(group.id);
    const groupClasses = [
      "ws-group",
      group.color ? "ws-group--colored" : "",
      dnd.isGroupDragging(group.id) ? "dragging" : "",
      edge === "before" ? "drop-before" : "",
      edge === "after" ? "drop-after" : "",
      dnd.isWorkspaceOverGroup(group.id) ? "drop-into" : "",
    ]
      .filter(Boolean)
      .join(" ");

    const colorStyle = group.color
      ? ({ "--ws-group-color": group.color } as React.CSSProperties)
      : undefined;

    return (
      <li
        key={group.id}
        className={groupClasses}
        style={colorStyle}
        {...dnd.groupCardProps(group.id)}
      >
        <div
          className="ws-group-header"
          {...dnd.groupHandleProps(group.id)}
          onClick={() => toggleGroupCollapsed(group.id)}
          onDoubleClick={(e) => {
            e.stopPropagation();
            void openGroupProperties(ctx, group);
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            if (e.button === 2) {
              openGroupMenu(group, { at: { x: e.clientX, y: e.clientY } });
            } else {
              openGroupMenu(group, { anchor: e.currentTarget });
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
  }

  return (
    <>
      <div
        className="panel-body workspaces-body"
        {...dnd.ungroupedZoneProps(firstEntryId, lastEntryId)}
      >
        {!snap.hydrated && <div className="placeholder">Loading…</div>}
        {snap.hydrated &&
          (snap.open.length > 0 || storeSnap.panelOrder.length > 0) && (
            <ul
              className="ws-list"
              role="listbox"
              aria-label="Open workspaces"
              {...roving.containerProps}
            >
              {storeSnap.panelOrder.map((entryId) => {
                const group = storeSnap.groups[entryId];
                if (group) return renderGroupCard(group);
                const ws = openById.get(entryId);
                if (!ws) return null; // closed or stale ungrouped workspace
                return renderWorkspaceItem(ws, rovingIndex.get(entryId) ?? 0);
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

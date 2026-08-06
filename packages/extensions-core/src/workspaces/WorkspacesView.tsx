import React, {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { CaretRight, SquaresFour } from "@phosphor-icons/react";
import { useSnapshot } from "valtio";
import {
  store,
  moveWorkspaceToGroup,
  ungroupWorkspace,
  toggleGroupCollapsed,
  workspaceGroupMap,
} from "@silo-code/extension-host/internal";
import {
  ActivityGlyph,
  Badge,
  useFocusGroup,
  useServiceState,
  type ExtensionContext,
  type MenuEntry,
  type WorkspaceStatusRow,
} from "@silo-code/sdk";
import {
  buildWorkspaceMenuItems,
  homeDir,
  workspaceSectionRegistry,
} from "@silo-code/extension-host/internal";
import {
  fullPath,
  FrontTruncatedPath,
  formatElapsed,
  useNow,
  type Workspace,
} from "./workspace-helpers";
import {
  confirmAndCloseGroup,
  confirmAndCloseWorkspace,
  confirmAndDeleteGroup,
} from "./workspace-add-menu";
import { openWorkspaceProperties } from "./workspace-properties";
import { openGroupProperties, type GroupSnapshot } from "./group-properties";
import { useWorkspaceDnd } from "./use-workspace-dnd";
import { buildNavItems } from "./workspace-nav";
import "./WorkspacesView.css";

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

// Deterministic per-row jitter so multiple animated activity glyphs
// (working rings, ready throb) don't move in lockstep — hashed from the
// stable row id (not Math.random()) so the offset doesn't jump around on
// re-render. Expressed as a negative delay so the animation starts already in
// progress rather than pausing on mount.
function activityJitterStyle(id: string): React.CSSProperties {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  const delaySeconds = -(((hash >>> 0) % 1000) / 1000) * 1.8;
  return {
    "--silo-activity-jitter": `${delaySeconds.toFixed(3)}s`,
  } as React.CSSProperties;
}

function WorkspaceStatusRows({
  workspaceId,
  rows,
}: {
  workspaceId: string;
  rows: WorkspaceStatusRow[];
}) {
  if (rows.length === 0) return null;
  return (
    <>
      {rows.map((row) => (
        <div key={row.id} className="ws-status-row">
          <ActivityGlyph
            activity={row.activity}
            size="sm"
            style={
              row.activity === "working" || row.activity === "ready"
                ? // Providers commonly reuse the same row id across every
                  // workspace (e.g. a fixed "build-task" id) — fold in the
                  // workspace id too, or every workspace's dot would still
                  // land on the same delay and throb in lockstep.
                  activityJitterStyle(`${workspaceId}:${row.id}`)
                : undefined
            }
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

export function WorkspacesView({ ctx }: { ctx: ExtensionContext }) {
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

  // 1s so formatElapsed's seconds-resolution display (< 1 minute) ticks live;
  // rows past a minute don't need it but the tick is cheap for a side panel.
  useNow(1_000);

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

  // The flat, ordered set of keyboard-navigable rows the arrow keys rove: group
  // headers and every *rendered* workspace (ungrouped, or grouped under an
  // expanded group), in the same order they paint. A collapsed group's members
  // aren't in the DOM, so they're omitted — the header stands in for them until
  // it's expanded. Group and workspace ids share no namespace (`grp_` vs. `ws_`),
  // so a single id→index map is unambiguous.
  const navItems = useMemo(
    () =>
      buildNavItems(storeSnap.panelOrder, storeSnap.groups, (id) =>
        openById.has(id),
      ),
    [storeSnap.panelOrder, storeSnap.groups, openById],
  );
  const navIndex = useMemo(
    () => new Map(navItems.map((it, i) => [it.id, i])),
    [navItems],
  );

  // First / last *rendered* top-level entries — the anchors for the background
  // catch-all zone (drop above the first → beginning, below the last → end).
  const renderedEntryIds = useMemo(
    () =>
      storeSnap.panelOrder.filter(
        (id) =>
          (storeSnap.groups[id] && !storeSnap.groups[id].closedAt) ||
          openById.has(id),
      ),
    [storeSnap.panelOrder, storeSnap.groups, openById],
  );
  const firstEntryId = renderedEntryIds[0] ?? null;
  const lastEntryId = renderedEntryIds[renderedEntryIds.length - 1] ?? null;

  const activeIndex = snap.activeId ? (navIndex.get(snap.activeId) ?? -1) : -1;

  const roving = useFocusGroup({
    count: navItems.length,
    start: activeIndex >= 0 ? activeIndex : 0,
    onActivate: (i) => {
      const item = navItems[i];
      if (!item) return;
      if (item.kind === "group") toggleGroupCollapsed(item.id);
      else service.activate(item.id);
    },
    onMenu: (i, anchor) => {
      const item = navItems[i];
      if (!item) return;
      if (item.kind === "group") {
        const group = storeSnap.groups[item.id];
        if (group) openGroupMenu(group, { anchor });
      } else {
        const ws = openById.get(item.id);
        if (ws) openWorkspaceMenu(ws, { anchor });
      }
    },
  });

  function workspaceMenuItems(ws: Workspace): MenuEntry[] {
    // Group membership — the only rows unique to this view, since group state
    // is core-only (ADR 0023). Everything else (Properties…, Close, the
    // "workspace"-surface contributions) comes from the shared builder that
    // also backs ctx.workspaces.getWorkspaceMenuItems, so the workspace row and
    // any extension surface naming a workspace can't drift apart.
    const groupItems: MenuEntry[] = [];
    const currentGroupId = groupMap.get(ws.id);
    const groups = storeSnap.panelOrder
      .map((id) => storeSnap.groups[id])
      .filter((g) => g && !g.closedAt);
    if (currentGroupId) {
      groupItems.push({
        label: "Remove from Group",
        run: () => ungroupWorkspace(ws.id),
      });
    } else if (groups.length > 0) {
      groupItems.push({
        label: "Move to Group",
        submenu: groups.map((group) => ({
          label: group.name,
          run: () => moveWorkspaceToGroup(ws.id, group.id),
        })),
      });
    }
    return buildWorkspaceMenuItems(ws.id, groupItems);
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
          label: "Close Group",
          run: () => void confirmAndCloseGroup(ctx, group.id, group.name),
        },
        {
          label: "Delete Group",
          run: () => void confirmAndDeleteGroup(ctx, group.id, group.name),
        },
      ],
      toggle: false,
      ...placement,
    });
  }

  // ── Workspace item renderer (shared by top-level + group body) ────────────
  // Every rendered workspace is keyboard-focusable; `groupId` is set for a row
  // that lives inside a group (drives its drag wiring and styling).

  function renderWorkspaceItem(ws: Workspace, groupId?: string) {
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

    const focusProps = roving.getItemProps(navIndex.get(ws.id) ?? 0);

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
          <span className="ws-name">{ws.name}</span>
          {service.getBadges(ws.id).map((b) => (
            <span
              key={b.id}
              className="ws-badge"
              style={
                b.color
                  ? ({
                      ["--ws-badge-bg" as string]: b.color,
                      ["--ws-badge-fg" as string]: "#fff",
                    } as React.CSSProperties)
                  : undefined
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
            <Badge size="sm">+{ws.extraFolders!.length}</Badge>
          )}
        </div>
        <WorkspaceStatusRows
          workspaceId={ws.id}
          rows={service.getStatus(ws.id)}
        />
        <div className="ws-sections">
          {workspaceSectionRegistry.list().map((p) => {
            const Comp = p.component;
            return <Comp key={p.id} workspaceId={ws.id} />;
          })}
        </div>
        <button
          className="ws-close"
          tabIndex={-1}
          aria-label="Close workspace"
          onClick={(e) => {
            e.stopPropagation();
            void confirmAndCloseWorkspace(ctx, ws.id, ws.name);
          }}
        >
          ×
        </button>
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
          role="option"
          aria-selected={false}
          aria-expanded={!group.collapsed}
          {...roving.getItemProps(navIndex.get(group.id) ?? 0)}
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
          <button
            className="ws-close"
            tabIndex={-1}
            aria-label="Close group"
            onClick={(e) => {
              e.stopPropagation();
              void confirmAndCloseGroup(ctx, group.id, group.name);
            }}
          >
            ×
          </button>
        </div>
        {!group.collapsed && (
          <ul className="ws-group-body">
            {group.workspaceOrder.map((wsId) => {
              const ws = openById.get(wsId);
              if (!ws) return null;
              return renderWorkspaceItem(ws, group.id);
            })}
          </ul>
        )}
      </li>
    );
  }

  return (
    <div
      className="workspaces-body"
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
              if (group) return group.closedAt ? null : renderGroupCard(group);
              const ws = openById.get(entryId);
              if (!ws) return null; // closed or stale ungrouped workspace
              return renderWorkspaceItem(ws);
            })}
          </ul>
        )}
    </div>
  );
}

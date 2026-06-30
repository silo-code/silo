import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { CaretRight, Plus, SquaresFour } from "@phosphor-icons/react";
import { useSnapshot } from "valtio";
import {
  store,
  createSection,
  renameSection,
  deleteSection,
  reorderSections,
  moveWorkspaceToSection,
  removeWorkspaceFromSection,
  reorderWorkspaceInSection,
  toggleSectionCollapsed,
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
  type DropTarget,
} from "./workspace-helpers";
import { buildAddWorkspaceItems } from "./workspace-add-menu";
import { openWorkspaceProperties } from "./workspace-properties";
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

  // Workspace DnD state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  // Section DnD state
  const [draggingSectionId, setDraggingSectionId] = useState<string | null>(
    null,
  );
  const [sectionDropTarget, setSectionDropTarget] =
    useState<DropTarget | null>(null);

  const addWrapRef = useRef<HTMLDivElement | null>(null);
  useNow();

  // Partition open workspaces into unsectioned (shown at top) and the rest
  // (shown inside their sections below).
  const unsectioned = useMemo(
    () => snap.open.filter((ws) => !storeSnap.workspaceSections[ws.id]),
    [snap.open, storeSnap.workspaceSections],
  );

  // O(1) lookup for workspaces by id (for section body rendering).
  const openById = useMemo(
    () => new Map(snap.open.map((ws) => [ws.id, ws])),
    [snap.open],
  );

  const activeIndex = unsectioned.findIndex((w) => w.id === snap.activeId);

  // Roving keyboard focus covers unsectioned workspaces only (v1).
  const group = useFocusGroup({
    count: unsectioned.length,
    start: activeIndex >= 0 ? activeIndex : 0,
    onActivate: (i) => service.activate(unsectioned[i].id),
    onMenu: (i, anchor) => openWorkspaceMenu(unsectioned[i], { anchor }),
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

  function onNewSection() {
    void ctx.ui
      .prompt({ title: "New Section", label: "Name" })
      .then((name) => {
        if (name?.trim()) createSection(name.trim());
      });
  }

  function openRenameSectionModal(secId: string, currentName: string) {
    void ctx.ui
      .prompt({ title: "Rename Section", label: "Name", initialValue: currentName })
      .then((name) => {
        if (name?.trim()) renameSection(secId, name.trim());
      });
  }

  function openClosedMenu() {
    const items = buildAddWorkspaceItems({
      ctx,
      closed: snap.closed,
      folderExistence,
      onNew,
      onNewSection,
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

    // Section membership actions
    const currentSecId = storeSnap.workspaceSections[ws.id];
    if (currentSecId) {
      items.push({
        label: "Remove from Section",
        run: () => removeWorkspaceFromSection(ws.id),
      });
    } else if (storeSnap.sectionOrder.length > 0) {
      items.push({
        label: "Move to Section",
        submenu: storeSnap.sectionOrder
          .map((secId) => storeSnap.sections[secId])
          .filter(Boolean)
          .map((sec) => ({
            label: sec.name,
            run: () => moveWorkspaceToSection(ws.id, sec.id),
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

  function openSectionMenu(
    secId: string,
    secName: string,
    placement: { at?: { x: number; y: number }; anchor?: HTMLElement | null },
  ) {
    void ctx.ui.showMenu({
      items: [
        {
          label: "Rename…",
          run: () => openRenameSectionModal(secId, secName),
        },
        {
          label: "Delete Section",
          run: () => deleteSection(secId),
        },
      ],
      toggle: false,
      ...placement,
    });
  }

  // ── Workspace DnD (unsectioned list) ────────────────────────────────────

  function onDragStart(
    e: React.DragEvent<HTMLLIElement>,
    id: string,
    sectionId?: string,
  ) {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/x-workspace-id", id);
    e.dataTransfer.setData("text/x-source-section", sectionId ?? "");
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

  function onDrop(
    e: React.DragEvent<HTMLLIElement>,
    targetId: string,
    targetSectionId?: string,
  ) {
    e.preventDefault();
    if (draggingId && dropTarget && draggingId !== targetId) {
      const sourceSection = e.dataTransfer.getData("text/x-source-section");
      if (targetSectionId && sourceSection === targetSectionId) {
        // Reorder within same section
        reorderWorkspaceInSection(
          targetSectionId,
          draggingId,
          dropTarget.id,
          dropTarget.position,
        );
      } else {
        service.reorder(draggingId, dropTarget.id, dropTarget.position);
      }
    }
    setDraggingId(null);
    setDropTarget(null);
  }

  function onDragEnd() {
    setDraggingId(null);
    setDropTarget(null);
  }

  // ── Section DnD ─────────────────────────────────────────────────────────

  function onSectionDragStart(e: React.DragEvent<HTMLDivElement>, secId: string) {
    setDraggingSectionId(secId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/x-section-id", secId);
    // Stop the event from propagating to any workspace drag handlers
    e.stopPropagation();
  }

  function onSectionDragOver(
    e: React.DragEvent<HTMLDivElement>,
    targetSecId: string,
  ) {
    if (!draggingSectionId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (draggingSectionId === targetSecId) {
      if (sectionDropTarget) setSectionDropTarget(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const position =
      e.clientY < rect.top + rect.height / 2 ? "before" : "after";
    if (
      sectionDropTarget?.id !== targetSecId ||
      sectionDropTarget.position !== position
    ) {
      setSectionDropTarget({ id: targetSecId, position });
    }
  }

  function onSectionDrop(
    e: React.DragEvent<HTMLDivElement>,
    targetSecId: string,
  ) {
    e.preventDefault();
    if (
      draggingSectionId &&
      sectionDropTarget &&
      draggingSectionId !== targetSecId
    ) {
      reorderSections(
        draggingSectionId,
        sectionDropTarget.id,
        sectionDropTarget.position,
      );
    }
    setDraggingSectionId(null);
    setSectionDropTarget(null);
  }

  function onSectionDragEnd() {
    setDraggingSectionId(null);
    setSectionDropTarget(null);
  }

  // ── Workspace item renderer (shared by unsectioned + section body) ───────

  function renderWorkspaceItem(ws: Workspace, i: number, sectionId?: string) {
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

    // useFocusGroup props only apply to unsectioned items
    const focusProps = sectionId === undefined ? group.getItemProps(i) : {};

    return (
      <li
        key={ws.id}
        className={classes}
        role="option"
        aria-selected={snap.activeId === ws.id}
        {...focusProps}
        draggable
        onDragStart={(e) => onDragStart(e, ws.id, sectionId)}
        onDragOver={(e) => onDragOver(e, ws.id)}
        onDrop={(e) => onDrop(e, ws.id, sectionId)}
        onDragEnd={onDragEnd}
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
        {snap.hydrated && (snap.open.length > 0 || storeSnap.sectionOrder.length > 0) && (
          <ul
            className="ws-list"
            role="listbox"
            aria-label="Open workspaces"
            {...group.containerProps}
          >
            {/* Unsectioned open workspaces */}
            {unsectioned.map((ws, i) => renderWorkspaceItem(ws, i))}

            {/* Sections */}
            {storeSnap.sectionOrder.map((secId) => {
              const sec = storeSnap.sections[secId];
              if (!sec) return null;

              const isSectionDragging = draggingSectionId === sec.id;
              const isSectionDropBefore =
                sectionDropTarget?.id === sec.id &&
                sectionDropTarget.position === "before";
              const isSectionDropAfter =
                sectionDropTarget?.id === sec.id &&
                sectionDropTarget.position === "after";

              const headerClasses = [
                "ws-section-header",
                isSectionDragging ? "dragging" : "",
                isSectionDropBefore ? "drop-before" : "",
                isSectionDropAfter ? "drop-after" : "",
              ]
                .filter(Boolean)
                .join(" ");

              return (
                <li key={sec.id} className="ws-section">
                  <div
                    className={headerClasses}
                    draggable
                    onClick={() => toggleSectionCollapsed(sec.id)}
                    onDragStart={(e) => onSectionDragStart(e, sec.id)}
                    onDragOver={(e) => onSectionDragOver(e, sec.id)}
                    onDrop={(e) => onSectionDrop(e, sec.id)}
                    onDragEnd={onSectionDragEnd}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      if (e.button === 2) {
                        openSectionMenu(sec.id, sec.name, {
                          at: { x: e.clientX, y: e.clientY },
                        });
                      } else {
                        openSectionMenu(sec.id, sec.name, {
                          anchor: e.currentTarget,
                        });
                      }
                    }}
                  >
                    <CaretRight
                      className={`ws-section-caret${sec.collapsed ? "" : " expanded"}`}
                      size={12}
                      weight="bold"
                    />
                    <span className="ws-section-name">{sec.name}</span>
                  </div>
                  {!sec.collapsed && (
                    <ul className="ws-section-body">
                      {sec.workspaceOrder.map((wsId) => {
                        const ws = openById.get(wsId);
                        if (!ws) return null;
                        return renderWorkspaceItem(ws, 0, sec.id);
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

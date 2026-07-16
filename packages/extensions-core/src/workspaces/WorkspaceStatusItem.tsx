import { useEffect, useMemo, useRef, useState } from "react";
import { useSnapshot } from "valtio";
import { SquaresFour } from "@phosphor-icons/react";
import {
  useServiceState,
  type ExtensionContext,
  type MenuEntry,
} from "@silo-code/sdk";
import {
  homeDir,
  store,
  Tooltip,
  partitionSavedEntries,
} from "@silo-code/extension-host/internal";
import { useFolderExistence } from "./workspace-helpers";
import {
  buildAddWorkspaceItems,
  confirmAndCloseWorkspace,
} from "./workspace-add-menu";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { openWorkspaceProperties } from "./workspace-properties";
import "./WorkspaceStatusItem.css";

/**
 * Bottom-left status-bar entry: the active workspace's name. Clicking it pops a
 * menu to switch between open workspaces, cascade out to add one (the same
 * "Add workspace" menu as the workspaces panel), open Properties, or Close.
 * This component is always mounted (the status bar renders unconditionally,
 * unlike the collapsible side panel). The workspaces panel and this item both
 * open the one Workspace Properties dialog through `openWorkspaceProperties`,
 * which pops it via `ctx.ui.showModal`.
 */
export function WorkspaceStatusItem({ ctx }: { ctx: ExtensionContext }) {
  const service = ctx.workspaces;
  const snap = useServiceState(service);
  const storeSnap = useSnapshot(store);
  const [home, setHome] = useState("");
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    homeDir()
      .then(setHome)
      .catch(() => {});
  }, []);

  const savedEntries = useMemo(
    () => partitionSavedEntries(snap.closed, storeSnap.groups),
    [snap.closed, storeSnap.groups],
  );
  const closedFolders = useMemo(
    () => savedEntries.workspaces.map((ws) => ws.folder),
    [savedEntries.workspaces],
  );
  const folderExistence = useFolderExistence(closedFolders, ctx.files);

  const active = snap.all.find((w) => w.id === snap.activeId) ?? null;

  function onNew() {
    void service.createFromFolderPicker().catch((err) => {
      console.error("create workspace failed", err);
    });
  }

  function openMenu() {
    if (!active) return;
    const activeId = active.id;
    const items: MenuEntry[] = [];
    // 0. Header.
    items.push({ type: "header", label: "Workspaces" });
    // 1. Open workspaces — click to switch (the active one is checked).
    for (const ws of snap.open) {
      items.push({
        label: ws.name,
        icon: <SquaresFour size={16} weight="duotone" />,
        checked: ws.id === snap.activeId,
        run: () => service.activate(ws.id),
      });
    }
    // 2. Cycle shortcuts (keyboard hint).
    items.push({ type: "separator" });
    items.push({
      label: "Cycle to Next Workspace",
      accelerator: "⌘`",
      run: () => ctx.executeCommand("workspace.cycleForward"),
    });
    items.push({
      label: "Cycle to Previous Workspace",
      accelerator: "⌘~",
      run: () => ctx.executeCommand("workspace.cycleBackward"),
    });
    // 3. ── divider ──
    items.push({ type: "separator" });
    // 4. Open — cascades to the panel's add menu.
    items.push({
      label: "Open",
      submenu: buildAddWorkspaceItems({
        ctx,
        closed: savedEntries.workspaces,
        closedGroups: savedEntries.groupEntries,
        folderExistence,
        onNew,
        onNewGroup: () => {
          void ctx.executeCommand("workspace.newGroup");
        },
      }),
    });
    // 5. ── divider ──
    items.push({ type: "separator" });
    // 6 & 7. Properties / Close, acting on the active workspace.
    items.push({
      label: "Properties…",
      run: () => {
        const ws = snap.all.find((w) => w.id === activeId);
        if (ws) void openWorkspaceProperties(ctx, home, ws);
      },
    });
    items.push({
      label: "Close",
      run: () => void confirmAndCloseWorkspace(ctx, activeId, active.name),
    });
    void ctx.ui.showMenu({ items, anchor: buttonRef.current });
  }

  return (
    <>
      {active && (
        <Tooltip content="Workspaces — ⌘` to cycle">
          <button ref={buttonRef} className="ws-status-item" onClick={openMenu}>
            <SquaresFour
              size="1.15em"
              weight="duotone"
              className="ws-status-icon"
            />
            <span className="ws-status-name">{active.name}</span>
          </button>
        </Tooltip>
      )}
      <WorkspaceSwitcher anchorRef={buttonRef} />
    </>
  );
}

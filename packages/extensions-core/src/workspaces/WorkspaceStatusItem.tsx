import { useEffect, useRef, useState } from "react";
import { SquaresFour } from "@phosphor-icons/react";
import {
  useServiceState,
  type ExtensionContext,
  type MenuEntry,
} from "@silo-code/sdk";
import {
  homeDir,
  Tooltip,
  confirmAndCloseWorkspace,
} from "@silo-code/extension-host/internal";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { openWorkspaceProperties } from "./workspace-properties";
import "./WorkspaceStatusItem.css";

/**
 * Bottom-left status-bar entry: the active workspace's name. Clicking it pops a
 * menu to switch between open workspaces, cascade out to add one (the same
 * "Add workspace" menu as the Navigator's + button), open Properties, or Close.
 * This component is always mounted (the status bar renders unconditionally,
 * unlike the collapsible side panel). The Workspaces view and this item both
 * open the one Workspace Properties dialog through `openWorkspaceProperties`,
 * which pops it via `ctx.ui.showModal`.
 */
export function WorkspaceStatusItem({ ctx }: { ctx: ExtensionContext }) {
  const service = ctx.workspaces;
  const snap = useServiceState(service);
  const [home, setHome] = useState("");
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    homeDir()
      .then(setHome)
      .catch(() => {});
  }, []);

  const active = snap.all.find((w) => w.id === snap.activeId) ?? null;

  async function openMenu() {
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
    // 4. Open — cascades to the same menu the Navigator's + button opens,
    // built once by the host so the two can't drift.
    items.push({
      label: "Open",
      submenu: await ctx.workspaces.getOpenWorkspaceMenuItems(),
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
      run: () => void confirmAndCloseWorkspace(activeId, active.name),
    });
    void ctx.ui.showMenu({ items, anchor: buttonRef.current });
  }

  return (
    <>
      {active && (
        <Tooltip content="Workspaces — ⌘` to cycle">
          <button
            ref={buttonRef}
            className="ws-status-item"
            onClick={() => void openMenu()}
          >
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

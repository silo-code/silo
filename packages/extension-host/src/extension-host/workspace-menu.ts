import { snapshot } from "valtio";
import type { MenuEntry, Workspace } from "@silo-code/sdk";
import { store } from "../state/store";
import { closeWorkspace } from "../state/workspaces";
import { getUiService } from "./ui-service";
import { confirmWithDontShowAgain } from "./confirm-with-dont-show-again";
import { getGlobalExtensionStorage } from "./extension-storage";
import { commandRegistry, executeCommand } from "./commands";
import { contextMenuEntriesFor } from "./context-menu-items";

// The **one** builder for a workspace's context menu — Properties…, Close, then
// whatever extensions contributed on the `workspace` surface (RFC 0013).
// Published as `ctx.workspaces.getWorkspaceMenuItems()` so a surface that
// mentions a workspace without *being* the workspace list (an agent row naming
// the workspace its terminal lives in) offers the same actions.
//
// Group actions are deliberately absent: group membership is host-internal and
// core-only (ADR 0023), so the Workspaces view appends those itself.

// Same storage bag as the rest of the workspace dialogs, so one "don't show
// again" covers every surface. See open-workspace-menu.tsx.
const workspacesStorage = getGlobalExtensionStorage("core.workspaces");

/** The command `core.workspaces` registers to open its properties modal for a
 * given workspace. Dispatching rather than calling keeps the modal — and the
 * property-page tabs it renders — owned by the extension that owns them. */
const PROPERTIES_COMMAND = "workspace.properties";

/**
 * Show the educational "closing keeps terminals alive" popup, then close.
 * The **one** close-confirm for a workspace — context menus, the × button,
 * the status-bar item, and the close command all go through here so the copy
 * and the `closeWorkspace.dontShowAgain` bag can't drift.
 */
export async function confirmAndCloseWorkspace(
  id: string,
  name: string,
): Promise<void> {
  const ok = await confirmWithDontShowAgain(getUiService(), workspacesStorage, {
    storageKey: "closeWorkspace.dontShowAgain",
    title: "Close workspace",
    body: `Closing "${name}" keeps its terminals running in the background — reopen it anytime to pick up where you left off.`,
    confirmLabel: "Close",
    mode: { kind: "info" },
  });
  if (!ok) return;
  closeWorkspace(id);
}

/**
 * Menu rows for one workspace. Returns an empty array for an unknown id.
 * Properties… is omitted when no extension has registered the command that
 * opens it (it ships with `core.workspaces`, so in practice it is there).
 *
 * `extra` slots caller-specific rows in directly below Properties…, which is
 * where the Workspaces view's group actions have always sat. It exists so that
 * view can share these rows rather than keep a second copy that drifts — it is
 * core-only (via the internal barrel); the public
 * `ctx.workspaces.getWorkspaceMenuItems(id)` takes the id alone.
 */
export function buildWorkspaceMenuItems(
  workspaceId: string,
  extra: MenuEntry[] = [],
): MenuEntry[] {
  const ws = snapshot(store).workspaces[workspaceId] as Workspace | undefined;
  if (!ws) return [];

  const items: MenuEntry[] = [];
  if (commandRegistry.get(PROPERTIES_COMMAND)) {
    items.push({
      label: "Properties…",
      run: () => void executeCommand(PROPERTIES_COMMAND, workspaceId),
    });
  }
  items.push(...extra);
  if (!ws.closedAt) {
    items.push({
      label: "Close",
      run: () => void confirmAndCloseWorkspace(ws.id, ws.name),
    });
  }

  const contributed = contextMenuEntriesFor("workspace", ws);
  if (contributed.length > 0) {
    if (items.length > 0) items.push({ type: "separator" });
    items.push(...contributed);
  }
  return items;
}

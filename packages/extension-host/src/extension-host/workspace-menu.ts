import { snapshot } from "valtio";
import type { MenuEntry, Workspace } from "@silo-code/sdk";
import { store } from "../state/store";
import { closeWorkspace } from "../state/workspaces";
import { getUiService } from "./ui-service";
import { confirmWithDontShowAgain } from "./confirm-with-dont-show-again";
import { chatAgentInfos } from "./agents/chat-agent-registry";
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

/** How many Chat sessions in this workspace are mid-turn — the only ones whose
 *  work a close would actually destroy. */
export function workingChatAgentCount(workspaceId: string): number {
  return chatAgentInfos().filter(
    (a) => a.workspaceId === workspaceId && a.activity === "working",
  ).length;
}

/** Wording for the agent warning. Only ever called for `count >= 1`. */
export function describeWorkspaceAgentWarning(
  count: number,
  name: string,
): string {
  const agents = count === 1 ? "1 chat agent is" : `${count} chat agents are`;
  const them = count === 1 ? "it" : "them";
  return `${agents} working in "${name}". Closing the workspace will cancel ${them}. Terminals keep running.`;
}

/**
 * Warn before a close cancels a Chat agent that is mid-turn, mirroring the
 * app-quit guard (`agent-close-guard.ts`) — same reason, smaller blast radius.
 *
 * Closing a workspace unmounts its dock, and that unmount is what disposes its
 * Chat sessions: unlike a terminal, whose PTY is daemon-backed and outlives the
 * UI, an agent is a piped child and its turn dies with it. Keyed on
 * `activity === "working"` rather than merely connected, because an idle
 * session costs nothing to lose and warning about one would fire on nearly
 * every close.
 *
 * Deliberately **not** a `confirmWithDontShowAgain`: the close confirm that
 * follows is a reversible-action nicety worth letting the user silence, while
 * this one says work is about to be thrown away. Resolves `true` when there is
 * nothing working, so the common close is a single dialog.
 */
async function confirmCancellingWorkingAgents(
  id: string,
  name: string,
): Promise<boolean> {
  const working = workingChatAgentCount(id);
  if (working === 0) return true;
  return getUiService().confirm({
    title: "Agents still running",
    body: describeWorkspaceAgentWarning(working, name),
    confirmLabel: "Close Anyway",
    cancelLabel: "Cancel",
    danger: true,
  });
}

/**
 * Confirm, then close. The **one** close-confirm for a workspace — context
 * menus, the × button, the status-bar item, and the close command all go
 * through here so the copy and the `closeWorkspace.dontShowAgain` bag can't
 * drift.
 *
 * Uses `"confirm"` mode (Cancel + dismissible) rather than `"info"`: closing
 * is reversible (terminals keep running in the background), but the user
 * still needs a way to back out of this dialog without actually closing the
 * workspace (#571).
 */
export async function confirmAndCloseWorkspace(
  id: string,
  name: string,
): Promise<void> {
  if (!(await confirmCancellingWorkingAgents(id, name))) return;
  const ok = await confirmWithDontShowAgain(getUiService(), workspacesStorage, {
    storageKey: "closeWorkspace.dontShowAgain",
    title: "Close workspace",
    body: `Closing "${name}" keeps its terminals running in the background — reopen it anytime to pick up where you left off.`,
    confirmLabel: "Close",
    mode: { kind: "confirm" },
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

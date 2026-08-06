import {
  closeGroup,
  confirmWithDontShowAgain,
  deleteGroup,
} from "@silo-code/extension-host/internal";
import type { ExtensionContext } from "@silo-code/sdk";

// Confirm helpers for group close/delete. Workspace *close* is host-owned
// (`confirmAndCloseWorkspace` on the internal barrel) so the context menu,
// × button, status item, and command share one Implementation. Workspace
// *delete* lives next to the Open Workspace menu builder for the same reason.

/** Show the educational "closing keeps terminals alive" popup, then close a
 * group. Skipped once the user opts out via "Don't show this again". */
export async function confirmAndCloseGroup(
  ctx: ExtensionContext,
  id: string,
  name: string,
): Promise<void> {
  const ok = await confirmWithDontShowAgain(ctx.ui, ctx.storage.global, {
    storageKey: "closeGroup.dontShowAgain",
    title: "Close group",
    body: `Closing "${name}" closes all of its workspaces, but their terminals keep running in the background. Reopen the group anytime to bring them all back.`,
    confirmLabel: "Close Group",
    mode: { kind: "info" },
  });
  if (!ok) return;
  closeGroup(id);
}

/** Confirm, then delete a group. Member workspaces are kept and reappear
 * individually in Saved (deleting a group only ungroups its members). */
export async function confirmAndDeleteGroup(
  ctx: ExtensionContext,
  id: string,
  name: string,
): Promise<void> {
  const ok = await confirmWithDontShowAgain(ctx.ui, ctx.storage.global, {
    storageKey: "deleteGroup.dontShowAgain",
    title: "Delete group?",
    body: `${name} will be removed. Its workspaces stay saved and will appear individually.`,
    confirmLabel: "Delete",
    mode: { kind: "confirm", danger: true },
  });
  if (!ok) return;
  deleteGroup(id);
}

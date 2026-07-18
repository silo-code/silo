import type { ExtensionContext } from "@silo-code/sdk";
import type { Workspace } from "./workspace-helpers";
import { WorkspacePropertiesModal } from "./WorkspaceModals";

// The single Workspace Properties entry point. Both the workspaces panel
// (context menu / double-click) and the status-bar workspace name open the
// dialog through `openWorkspaceProperties` — there is exactly ONE definition
// of it, so the dialog lives in one place. The host owns the modal chrome
// (`ctx.ui.showModal`); the form content is `WorkspacePropertiesModal`.

/**
 * Open the Workspace Properties dialog for `ws`. Every field persists
 * immediately as it changes — folders, registered extension property pages,
 * and the name (via its own explicit Save in `InlineEdit`) — so there is
 * nothing staged to apply on close. Built on `ctx.ui.showModal` as a
 * dismissible modal (Escape / backdrop-click / the ✕ button all close it);
 * `InlineEdit`'s two-stage Escape cancels an in-progress name edit before a
 * second Escape closes the modal. Resolves once the dialog closes.
 */
export async function openWorkspaceProperties(
  ctx: ExtensionContext,
  home: string,
  ws: Workspace,
): Promise<void> {
  await ctx.ui.showModal(
    () => (
      <WorkspacePropertiesModal
        wsId={ws.id}
        home={home}
        workspaces={ctx.workspaces}
        files={ctx.files}
        onPickFolder={() => ctx.ui.pickFolder()}
        onManageWorktrees={() => {
          void ctx.executeCommand("silo.git.manageWorktrees", {
            workspaceId: ws.id,
          });
        }}
      />
    ),
    {
      title: "Workspace Properties",
      size: "lg",
      dismissible: true,
      className: "ws-props-dialog",
    },
  );
}

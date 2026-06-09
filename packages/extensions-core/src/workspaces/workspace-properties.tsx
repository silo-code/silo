import type { ExtensionContext } from "@silo-code/sdk";
import {
  applyWorkspaceProperties,
  type Workspace,
  type WorkspacePropertiesChanges,
} from "./workspace-helpers";
import { WorkspacePropertiesContent } from "./WorkspaceModals";

// The single Workspace Properties entry point. Both the workspaces panel
// (context menu / double-click) and the status-bar workspace name open the
// dialog through `openWorkspaceProperties` — there is exactly ONE definition of
// it, so the dialog and its save logic live in one place. The host owns the
// modal chrome (`ctx.ui.showModal`); the form content is `WorkspacePropertiesContent`.

/**
 * Open the Workspace Properties dialog for `ws` and apply the user's changes on
 * Save. Built on `ctx.ui.showModal` as a non-dismissible modal (Escape /
 * backdrop don't close it) so staged edits can't be lost to an accidental
 * click-away. Resolves once the dialog closes.
 */
export async function openWorkspaceProperties(
  ctx: ExtensionContext,
  home: string,
  ws: Workspace,
): Promise<void> {
  const changes = await ctx.ui.showModal<WorkspacePropertiesChanges>(
    (close) => (
      <WorkspacePropertiesContent
        ws={ws}
        home={home}
        onPickFolder={() => ctx.ui.pickFolder()}
        onCancel={() => close()}
        onSave={(c) => close(c)}
      />
    ),
    { title: "Workspace Properties", size: "md" },
  );
  if (changes) applyWorkspaceProperties(ctx.workspaces, ws.id, changes);
}

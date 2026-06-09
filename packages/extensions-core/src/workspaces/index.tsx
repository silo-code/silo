import type { Extension } from "@silo-code/sdk";
import { WorkspacesPanel } from "./WorkspacesPanel";
import { WorkspaceStatusItem } from "./WorkspaceStatusItem";
import { registerWorkspaceCycle } from "./workspace-cycle";

export const extension: Extension = {
  id: "core.workspaces",
  activate(ctx) {
    ctx.registerSidePanel({
      id: "workspaces",
      location: "left",
      title: "Workspaces",
      // Inject ctx so the panel reaches workspaces/terminals/files through the
      // public primitives, not host getters (see silo.file-explorer, 6662dcc).
      component: () => <WorkspacesPanel ctx={ctx} />,
      order: 1,
    });

    // Active-workspace name at the bottom-left of the status bar; click pops a
    // switch/add/properties/close menu (and hosts the single Properties dialog).
    ctx.registerStatusItem({
      id: "workspace.active",
      alignment: "left",
      priority: 0,
      component: () => <WorkspaceStatusItem ctx={ctx} />,
    });

    // cmd+Tab-style workspace cycling — a module of this extension.
    registerWorkspaceCycle(ctx);

    ctx.registerCommand({
      id: "workspace.new",
      label: "New Workspace…",
      run: () => {
        void ctx.workspaces.createFromFolderPicker().catch((err) => {
          console.error("create workspace failed", err);
        });
      },
    });

    ctx.registerCommand({
      id: "workspace.close",
      label: "Close Workspace",
      run: () => {
        const { activeId } = ctx.workspaces.getState();
        if (activeId) ctx.workspaces.close(activeId);
      },
    });

    ctx.registerCommand({
      id: "workspace.reopenLast",
      label: "Reopen Last Closed Workspace",
      run: () => {
        const { closed } = ctx.workspaces.getState();
        const last = closed[0];
        if (last) ctx.workspaces.reopen(last.id);
      },
    });
  },
};

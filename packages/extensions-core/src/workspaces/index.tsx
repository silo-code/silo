import type { Extension } from "@silo-code/sdk";
import {
  store,
  groupIdForWorkspace,
  homeDir,
} from "@silo-code/extension-host/internal";
import { WorkspacesView } from "./WorkspacesView";
import { WorkspaceStatusItem } from "./WorkspaceStatusItem";
import { registerWorkspaceCycle } from "./workspace-cycle";
import { openNewGroup } from "./group-properties";
import { openWorkspaceProperties } from "./workspace-properties";
import { confirmAndCloseWorkspace } from "./workspace-add-menu";
import { checkMissingExtraFolders } from "./missing-folder-notify";

export const extension: Extension = {
  id: "core.workspaces",
  activate(ctx) {
    // Log workspace lifecycle events to the Application output channel, and
    // (session-lifetime, de-duped per folder) notify if an extra folder no
    // longer exists on disk — see missing-folder-notify.ts.
    let prev = ctx.workspaces.getState();
    const notifiedMissingFolders = new Set<string>();
    const initialWs = prev.all.find((w) => w.id === prev.activeId);
    if (initialWs) {
      void checkMissingExtraFolders(ctx, initialWs, notifiedMissingFolders);
    }
    ctx.subscriptions.push(
      ctx.workspaces.subscribe((state) => {
        if (state.activeId !== prev.activeId && state.activeId) {
          const ws = state.all.find((w) => w.id === state.activeId);
          ctx.log.info(`Workspace activated: ${ws?.name ?? state.activeId}`);
          if (ws)
            void checkMissingExtraFolders(ctx, ws, notifiedMissingFolders);
        }
        for (const ws of state.all) {
          if (!prev.all.find((p) => p.id === ws.id)) {
            ctx.log.info(`Workspace created: ${ws.name}`);
          }
        }
        for (const ws of state.closed) {
          if (prev.open.find((p) => p.id === ws.id)) {
            ctx.log.info(`Workspace closed: ${ws.name}`);
          }
        }
        for (const ws of state.open) {
          if (prev.closed.find((p) => p.id === ws.id)) {
            ctx.log.info(`Workspace reopened: ${ws.name}`);
          }
        }
        prev = state;
      }),
    );

    // The workspace list is a view *of the Navigator* (core.navigator), not a
    // panel of its own — registered through the same public API a third-party
    // view uses, so there is exactly one way to add a way to navigate. `order: 0`
    // makes it the view the Navigator opens with.
    ctx.registerNavigatorView({
      id: "workspaces",
      title: "Workspaces",
      order: 0,
      // Inject ctx so the view reaches workspaces/terminals/files through the
      // public primitives, not host getters (see silo.file-explorer, 6662dcc).
      component: () => <WorkspacesView ctx={ctx} />,
    });

    // "Add workspace" in the Navigator header. A toolbar contribution rather
    // than panel chrome, which is what lets core.navigator stay ignorant of
    // workspaces — and it is deliberately *unscoped* (no `when`), so opening
    // or creating a workspace stays one click away from whichever view the
    // user is in.
    ctx.registerToolbarItem({
      id: "core.workspaces.add",
      surface: "navigator",
      icon: "Plus",
      label: "Add workspace",
      tooltip: "Add workspace",
      menu: () => ctx.workspaces.getOpenWorkspaceMenuItems(),
    });

    // Active-workspace name at the bottom-left of the status bar; click pops a
    // switch/add/properties/close menu (and hosts the single Properties dialog).
    ctx.registerStatusItem({
      id: "workspace.active",
      alignment: "left",
      priority: -10,
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
      id: "workspace.newGroup",
      label: "New Group…",
      run: () => {
        void openNewGroup(ctx);
      },
    });

    // Backs the Properties… row the host publishes in
    // `ctx.workspaces.getWorkspaceMenuItems()`. Dispatching a command is what
    // lets the host offer the row while this extension keeps owning the modal
    // (and the property-page tabs registered into it).
    ctx.registerCommand({
      id: "workspace.properties",
      label: "Workspace Properties…",
      run: (workspaceId) => {
        const id =
          typeof workspaceId === "string"
            ? workspaceId
            : ctx.workspaces.getState().activeId;
        if (!id) return;
        const ws = ctx.workspaces.get(id);
        if (!ws) return;
        void homeDir()
          .catch(() => "")
          .then((home) => openWorkspaceProperties(ctx, home, ws));
      },
    });

    ctx.registerCommand({
      id: "workspace.close",
      label: "Close Workspace",
      run: () => {
        const { activeId, all } = ctx.workspaces.getState();
        if (!activeId) return;
        const ws = all.find((w) => w.id === activeId);
        if (ws) void confirmAndCloseWorkspace(ctx, activeId, ws.name);
      },
    });

    ctx.registerCommand({
      id: "workspace.reopenLast",
      label: "Reopen Last Closed Workspace",
      run: () => {
        // Skip workspaces hidden inside a closed group — those are only
        // reachable by restoring the group from the Saved picker.
        const { closed } = ctx.workspaces.getState();
        const last = closed.find((ws) => {
          const groupId = groupIdForWorkspace(ws.id);
          return !groupId || !store.groups[groupId]?.closedAt;
        });
        if (last) ctx.workspaces.reopen(last.id);
      },
    });
  },
};

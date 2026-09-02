import type { Extension } from "@silo-code/sdk";
import { SquaresFour } from "@phosphor-icons/react";
import {
  store,
  groupIdForWorkspace,
  homeDir,
  confirmAndCloseWorkspace,
} from "@silo-code/extension-host/internal";
import type { NavigatorExtensionAPI } from "../navigator/navigator-api";
import { WorkspacesView } from "./WorkspacesView";
import { WorkspaceStatusItem } from "./WorkspaceStatusItem";
import { registerWorkspaceCycle } from "./workspace-cycle";
import { openNewGroup } from "./group-properties";
import { openWorkspaceProperties } from "./workspace-properties";

export const extension: Extension = {
  id: "core.workspaces",
  activate(ctx) {
    // Log workspace lifecycle events to the Application output channel.
    // Missing-extra-folder detection moved to silo.git-explorer (see
    // notify-missing-folder.ts) — it rides GitView's per-folder status
    // refresh, which fires far more often than a workspace-activation-only
    // check ever could.
    let prev = ctx.workspaces.getState();
    ctx.subscriptions.push(
      ctx.workspaces.subscribe((state) => {
        if (state.activeId !== prev.activeId && state.activeId) {
          const ws = state.all.find((w) => w.id === state.activeId);
          ctx.log.info(`Workspace activated: ${ws?.name ?? state.activeId}`);
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
      // Same glyph the workspace rows themselves carry, so the entry in the
      // Navigator's view list and the rows it leads to read as one thing.
      icon: <SquaresFour size={19} weight="duotone" />,
      // Inject ctx so the view reaches workspaces/terminals/files through the
      // public primitives, not host getters (see silo.file-explorer, 6662dcc).
      // Forward NavigatorViewProps (incl. `active`) so the first Adapter
      // exercises the same contract a third-party view sees.
      component: (props) => <WorkspacesView ctx={ctx} {...props} />,
    });

    // "Add workspace" — a toolbar contribution rather than panel chrome, which
    // is what lets `core.navigator` stay ignorant of workspaces. `core.navigator`
    // renders it in exactly one place — the Workspaces view's row / header /
    // section (ADR 0048) — and passes its `unscopedChromeTarget()` sentinel as
    // the `viewId`, so this `when` is a plain equality: it matches that slot and
    // nothing else, and returns false (target ≠ null) when the Workspaces view
    // is disabled, taking the "+" out of the Navigator entirely.
    ctx.registerToolbarItem({
      id: "core.workspaces.add",
      surface: "navigator",
      icon: "Plus",
      label: "Add workspace",
      tooltip: "Add workspace",
      when: (_keys, target) =>
        target.viewId ===
        ctx
          .getExtension<NavigatorExtensionAPI>("core.navigator")
          ?.api?.unscopedChromeTarget(),
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

    // A keyboard path to "new workspace" that doesn't depend on the Navigator's
    // "+" being visible — it isn't when the Workspaces view is disabled, and the
    // "+" is pointer-only regardless (ADR 0048). `cmd+shift+n` mirrors the
    // native File-menu `cmd+n` (new file).
    ctx.registerKeybinding({
      id: "workspace.new",
      key: "cmd+shift+n",
      command: "workspace.new",
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
        if (ws) void confirmAndCloseWorkspace(activeId, ws.name);
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

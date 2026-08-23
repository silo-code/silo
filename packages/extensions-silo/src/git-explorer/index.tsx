import type { Extension } from "@silo-code/sdk";
import { GitExplorerPanel } from "./GitExplorerPanel";
import {
  MANAGE_WORKTREES_COMMAND,
  resolveManageWorktreesTarget,
  showWorktreeManager,
  type ManageWorktreesArgs,
} from "./open-worktree-manager";
import {
  MANAGE_BRANCHES_COMMAND,
  resolveManageBranchesTarget,
  showBranchManager,
  type ManageBranchesArgs,
} from "./open-branch-manager";
import {
  getPendingRemoveStatusLabel,
  getPendingWorktreeRemoves,
  subscribePendingWorktreeRemoves,
} from "./pending-worktree-remove";
import "./GitExplorerPanel.css";

const PENDING_REMOVE_BUSY_ID = "silo.git-explorer.pending-remove";

// `silo.git-explorer` — the git panel (view). Consumes the `silo.git` provider's
// GitAPI via getExtension; resolves it at use time so the provider can activate
// in any order and a disabled provider degrades to a placeholder rather than a
// crash.
export const extension: Extension = {
  id: "silo.git-explorer",
  manifest: {
    name: "Git Explorer",
    description: "Git status and history in a side panel.",
  },
  activate(ctx) {
    ctx.registerSidePanel({
      id: "git-explorer",
      location: "right",
      title: "Git",
      // Inject ctx so the panel/view reach workspaces/editors/files through
      // the public primitives, not host getters. No `paused`/`active` wiring
      // needed here (ADR 0037) — GitAPI.watchRepo's lifecycle is ambient and
      // workspace-activation-driven, not tied to this panel's own visibility.
      component: ({ storage, hydrated }) => (
        <GitExplorerPanel ctx={ctx} storage={storage} hydrated={hydrated} />
      ),
      order: 2,
      lazyMount: true,
    });

    // ADR 0025 pending-remove → host busy-status slot (RFC 0026). Keep the
    // extension-scoped pending set as source of truth for modal chrome; only
    // the StatusBar presentation moved off a private StatusItem.
    const syncPendingRemoveBusy = () => {
      const label = getPendingRemoveStatusLabel();
      if (!label) {
        ctx.ui.busyStatus.clear(PENDING_REMOVE_BUSY_ID);
        return;
      }
      const pending = getPendingWorktreeRemoves();
      ctx.ui.busyStatus.set({
        id: PENDING_REMOVE_BUSY_ID,
        label,
        detail:
          pending.length > 1
            ? pending.map((p) => p.name).join(", ")
            : pending[0]?.path,
        urgency: "normal",
      });
    };
    const stopBusy = subscribePendingWorktreeRemoves(syncPendingRemoveBusy);
    syncPendingRemoveBusy();
    ctx.subscriptions.push({ dispose: stopBusy });

    // Workspace properties (and anything else) open the same Worktrees modal
    // the Git panel menu uses — one implementation, two entry points.
    ctx.registerCommand({
      id: MANAGE_WORKTREES_COMMAND,
      label: "Manage Worktrees…",
      run: (arg?: unknown) => {
        const target = resolveManageWorktreesTarget(
          ctx.workspaces.getState(),
          arg as ManageWorktreesArgs | undefined,
        );
        if (!target) return;
        showWorktreeManager(ctx, target);
      },
    });

    // A keybinding or the command palette can now reach the same Branches
    // modal the Git panel's "Manage branches…" menu item opens — one
    // implementation, multiple entry points (mirrors manageWorktrees above).
    ctx.registerCommand({
      id: MANAGE_BRANCHES_COMMAND,
      label: "Manage Branches…",
      run: (arg?: unknown) => {
        const target = resolveManageBranchesTarget(
          ctx.workspaces.getState(),
          arg as ManageBranchesArgs | undefined,
        );
        if (!target) return;
        showBranchManager(ctx, target);
      },
    });
  },
};

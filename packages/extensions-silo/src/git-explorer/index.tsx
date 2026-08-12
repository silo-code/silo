import { useSyncExternalStore } from "react";
import { ArrowsClockwise } from "@phosphor-icons/react";
import type { Extension } from "@silo-code/sdk";
import { GitExplorerPanel } from "./GitExplorerPanel";
import {
  MANAGE_WORKTREES_COMMAND,
  resolveManageWorktreesTarget,
  showWorktreeManager,
  type ManageWorktreesArgs,
} from "./open-worktree-manager";
import {
  getPendingRemoveStatusLabel,
  subscribePendingWorktreeRemoves,
} from "./pending-worktree-remove";
import "./GitExplorerPanel.css";

/** Informational StatusBar item while Remove worktree runs (ADR 0025). */
function PendingWorktreeRemoveStatus() {
  const label = useSyncExternalStore(
    subscribePendingWorktreeRemoves,
    getPendingRemoveStatusLabel,
    getPendingRemoveStatusLabel,
  );
  if (!label) return null;
  return (
    <span className="git-pending-remove-status" aria-live="polite">
      <ArrowsClockwise size={14} className="git-pending-remove-spin" />
      <span>{label}</span>
    </span>
  );
}

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

    ctx.registerStatusItem({
      id: "git-pending-worktree-remove",
      alignment: "left",
      // After the workspace name; extension zone (priority ≥ 0).
      priority: 0,
      tooltip: "A worktree is being removed",
      component: PendingWorktreeRemoveStatus,
    });

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
  },
};

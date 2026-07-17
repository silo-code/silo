import type { ExtensionContext, NotifyOptions } from "@silo-code/sdk";
import { GitErrorModal } from "./GitErrorModal";
import { summarizeGitError } from "./notify-error";
import { WorktreeManager } from "./WorktreeManager";

/** Command id — opened from the Git panel menu and workspace properties. */
export const MANAGE_WORKTREES_COMMAND = "silo.git.manageWorktrees";

export interface ManageWorktreesArgs {
  /** Workspace whose folders the manager opens against. Defaults to active. */
  workspaceId?: string;
  /**
   * Repo working directory to list worktrees for. Defaults to the workspace's
   * primary folder.
   */
  folder?: string;
}

/**
 * Open the host-owned Worktrees modal for a repo folder. Shared by the Git
 * panel menu and the `silo.git.manageWorktrees` command (workspace properties).
 */
export function showWorktreeManager(
  ctx: ExtensionContext,
  opts: {
    folder: string;
    workspaceId: string;
    /** Called after create/remove so a live Git view can re-read status. */
    onChanged?: () => void;
  },
): void {
  const notifyError = (title: string, err: unknown) => {
    const { detail, summary, hasMore } = summarizeGitError(err, title);
    const options: NotifyOptions = { title };
    if (hasMore) {
      options.actions = [
        {
          label: "View details",
          run: () =>
            ctx.ui.showModal(
              (close) => <GitErrorModal detail={detail} onClose={close} />,
              { title, dismissible: true, size: "lg" },
            ),
        },
      ];
    }
    ctx.ui.notify("error", summary, options);
  };

  ctx.ui.showModal(
    () => (
      <WorktreeManager
        ctx={ctx}
        folder={opts.folder}
        workspaceId={opts.workspaceId}
        onChanged={opts.onChanged ?? (() => {})}
        notifyError={notifyError}
      />
    ),
    { title: "Worktrees", size: "md", dismissible: true },
  );
}

/**
 * Resolve which workspace + folder a manage-worktrees invocation should open.
 * Returns `null` when no matching workspace exists.
 */
export function resolveManageWorktreesTarget(
  state: {
    activeId: string | null;
    all: readonly { id: string; folder: string }[];
  },
  args?: ManageWorktreesArgs,
): { workspaceId: string; folder: string } | null {
  const ws = args?.workspaceId
    ? state.all.find((w) => w.id === args.workspaceId)
    : state.all.find((w) => w.id === state.activeId);
  if (!ws) return null;
  return { workspaceId: ws.id, folder: args?.folder ?? ws.folder };
}

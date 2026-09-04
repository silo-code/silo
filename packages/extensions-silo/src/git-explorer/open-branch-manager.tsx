import type { ExtensionContext, NotifyOptions } from "@silo-code/sdk";
import { GitErrorModal } from "./GitErrorModal";
import { summarizeGitError } from "./notify-error";
import { BranchManager } from "./BranchManager";
import { BranchModalTitle } from "./BranchModalTitle";
import { createFolderSelection } from "./folder-selection";

/** Command id — opened from the Git panel menu, a keybinding, or the palette. */
export const MANAGE_BRANCHES_COMMAND = "silo.git.manageBranches";

export interface ManageBranchesArgs {
  /** Workspace whose folder the manager opens against. Defaults to active. */
  workspaceId?: string;
  /**
   * Repo working directory to list branches for. Defaults to the workspace's
   * primary folder.
   */
  folder?: string;
}

/**
 * Open the host-owned Branches modal for a repo folder. Shared by the Git
 * panel menu and the `silo.git.manageBranches` command (keybinding/palette).
 */
export function showBranchManager(
  ctx: ExtensionContext,
  opts: {
    folder: string;
    workspaceId: string;
    /** Called after a switch/create so a live Git view can re-read status. */
    onSwitched?: () => void;
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

  // Shared with the title's folder switcher — see folder-selection.ts for why
  // this can't just be component state.
  const selection = createFolderSelection(opts.folder);

  ctx.ui.showModal(
    (close) => (
      <BranchManager
        ctx={ctx}
        selection={selection}
        close={close}
        onSwitched={opts.onSwitched ?? (() => {})}
        notifyError={notifyError}
      />
    ),
    {
      title: (
        <BranchModalTitle
          ctx={ctx}
          workspaceId={opts.workspaceId}
          selection={selection}
        />
      ),
      size: "md",
      dismissible: true,
    },
  );
}

/**
 * Resolve which workspace + folder a manage-branches invocation should open.
 * Returns `null` when no matching workspace exists.
 */
export function resolveManageBranchesTarget(
  state: {
    activeId: string | null;
    all: readonly { id: string; folder: string }[];
  },
  args?: ManageBranchesArgs,
): { workspaceId: string; folder: string } | null {
  const ws = args?.workspaceId
    ? state.all.find((w) => w.id === args.workspaceId)
    : state.all.find((w) => w.id === state.activeId);
  if (!ws) return null;
  return { workspaceId: ws.id, folder: args?.folder ?? ws.folder };
}

import type { Extension } from "@silo-code/sdk";
import type { GitAPI } from "../git/git-api";
import { GitExplorerPanel } from "./GitExplorerPanel";
import { setGitApiResolver } from "./git-runtime";
import {
  MANAGE_WORKTREES_COMMAND,
  resolveManageWorktreesTarget,
  showWorktreeManager,
  type ManageWorktreesArgs,
} from "./open-worktree-manager";

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
    setGitApiResolver(() => ctx.getExtension<GitAPI>("silo.git")?.api);
    ctx.registerSidePanel({
      id: "git-explorer",
      location: "right",
      title: "Git",
      // Inject ctx so the panel/view reach workspaces/editors/files through
      // the public primitives, not host getters.
      component: ({ active, storage }) => (
        <GitExplorerPanel ctx={ctx} storage={storage} paused={!active} />
      ),
      order: 2,
      lazyMount: true,
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

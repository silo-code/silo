import type { Extension } from "@silo-code/sdk";
import type { GitAPI } from "../git/git-api";
import { GitExplorerPanel } from "./GitExplorerPanel";
import { setGitApiResolver } from "./git-runtime";

// `silo.git-explorer` — the git panel (view). Consumes the `silo.git` provider's
// GitAPI via getExtension; resolves it at use time so the provider can activate
// in any order and a disabled provider degrades to a placeholder rather than a
// crash.
export const extension: Extension = {
  id: "silo.git-explorer",
  activate(ctx) {
    setGitApiResolver(() => ctx.getExtension<GitAPI>("silo.git")?.api);
    ctx.registerSidePanel({
      id: "git-explorer",
      location: "right",
      title: "Git",
      // Inject ctx so the panel/view reach workspaces/editors/files through
      // the public primitives, not host getters.
      component: ({ active }) => (
        <GitExplorerPanel ctx={ctx} paused={!active} />
      ),
      order: 2,
      lazyMount: true,
    });
  },
};

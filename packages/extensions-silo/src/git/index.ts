import type { Extension } from "@silo-code/sdk";
import type { GitAPI } from "./git-api";
import { createGitService } from "./git-service";

// `silo.git` — the headless git provider. Publishes a GitAPI built entirely on
// `ctx.process.exec` (one-shot `git` invocations) + pure porcelain parsing; it
// registers no UI and holds no privileged host access of its own, which is why
// git is an extension, not core (see ctx-domains.md → Tier 2). The git-explorer
// view and the diff editor consume this via getExtension("silo.git").

/** Diff modes the git content provider understands (carried in OpenDiffSpec.args). */
type DiffMode = "workingTree" | "staged";

function relativeTo(absPath: string, folder: string): string {
  return absPath.startsWith(folder + "/")
    ? absPath.slice(folder.length + 1)
    : absPath;
}

export const extension: Extension<GitAPI> = {
  id: "silo.git",
  manifest: {
    name: "Git",
    description: "Source control provider — status, diffs, and history.",
  },
  activate(ctx): GitAPI {
    const READ_ONLY = new Set([
      "status",
      "log",
      "diff",
      "show",
      "for-each-ref",
    ]);
    const api = createGitService((command, args, options) => {
      // Strip --no-optional-locks from the display — it's an internal safeguard.
      const displayArgs = args.filter((a) => a !== "--no-optional-locks");
      const subcommand = displayArgs[0] ?? "";
      // `worktree list` is a read the panel polls; other worktree subcommands
      // (add/remove/prune) mutate and stay at info.
      const isReadOnly =
        READ_ONLY.has(subcommand) ||
        (subcommand === "worktree" && displayArgs[1] === "list");
      ctx.log[isReadOnly ? "debug" : "info"](
        `> ${[command, ...displayArgs].join(" ")}`,
        options?.cwd ? { cwd: options.cwd } : undefined,
      );
      return ctx.process.exec(command, args, options).then((result) => {
        if (result.code !== 0 && result.stderr.trim()) {
          ctx.log.error(result.stderr.trim());
        }
        return result;
      });
    });
    // Own the git-diff composition: core.editor's diff is generic and asks a
    // registered provider for the two sides. Lives here (the provider) so diffs
    // work even when the git-explorer panel is disabled. Tracked on
    // ctx.subscriptions so disabling git unregisters it (and re-enabling can
    // re-register — the provider registry rejects a duplicate id).
    ctx.subscriptions.push(
      ctx.editors.registerDiffContentProvider("silo.git", async (req) => {
        const folder = req.workspaceFolder;
        if (!folder) return { original: "", modified: "" };
        const relative = relativeTo(req.filePath, folder);
        const mode = req.args?.mode as DiffMode | undefined;
        // original = HEAD; modified = the index (staged) or the working file.
        const [original, modified] = await Promise.all([
          api.show(folder, `HEAD:${relative}`),
          mode === "staged"
            ? api.show(folder, `:${relative}`)
            : ctx.files.readText(req.filePath),
        ]);
        return { original, modified };
      }),
    );
    return api;
  },
};

import type { Disposable, Extension } from "@silo-code/sdk";
import type { GitAPI } from "@silo-code/git-api";
import { createGitService } from "./git-service";
import { createGitRepoTrackerRegistry } from "./repo-tracker";
import { notifyNewWorktree } from "../git-explorer/notify-new-worktree";
import { notifyMissingFolder } from "../git-explorer/notify-missing-folder";

// `silo.git` — the headless git provider. Publishes a GitAPI built entirely on
// `ctx.process.exec` (one-shot `git` invocations) + pure porcelain parsing; it
// registers no UI and holds no privileged host access of its own, which is why
// git is an extension, not core (see ADR 0009). The git-explorer view, the
// diff editor, and (per ADR 0037) any other first- or third-party extension
// consume this via getExtension("silo.git").

/** Diff modes the git content provider understands (carried in OpenDiffSpec.args). */
type DiffMode = "workingTree" | "staged" | "commit";

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
    const oneShotApi = createGitService((command, args, options) => {
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

    // ADR 0037: the live watch session, ambient and workspace-activation-
    // driven — a folder is tracked from the moment its workspace opens,
    // independent of whether any UI panel is ever mounted for it.
    const trackerRegistry = createGitRepoTrackerRegistry({
      api: oneShotApi,
      workspaces: {
        getState: () => ctx.workspaces.getState(),
        subscribe: (listener) => ctx.workspaces.subscribe(listener),
      },
      filesWatch: (path, listener) => ctx.files.watch(path, listener),
      log: ctx.log,
    });
    const api: GitAPI = {
      ...oneShotApi,
      watchRepo: trackerRegistry.watchRepo,
    };
    ctx.subscriptions.push({ dispose: () => trackerRegistry.dispose() });

    // Long-running-usage diagnostics: run from the command palette any time
    // to confirm the watch session isn't accumulating trackers it should
    // have torn down. Tracker start/stop are also logged at debug level as
    // they happen (see repo-tracker.ts), so the Git output channel doubles
    // as a passive audit trail over weeks of use.
    ctx.subscriptions.push(
      ctx.registerCommand({
        id: "silo.git.logWatchDiagnostics",
        label: "Git: Log Watch Session Diagnostics",
        run: () => {
          const snapshot = trackerRegistry.debugSnapshot();
          const openCount = ctx.workspaces.getState().open.length;
          ctx.log.info(
            `${snapshot.length} repo(s) tracked, across ${openCount} open workspace(s):`,
          );
          for (const t of snapshot) {
            ctx.log.info(
              `  ${t.cwd} — workspaceOwned=${t.workspaceOwned} subscribers=${t.subscriberCount} autofetch=${t.autofetching}`,
            );
          }
          ctx.log.show();
        },
      }),
    );

    // Built-in "new worktree" / "folder missing" toasts, fired from the
    // watch session's own events rather than a UI effect — so they fire for
    // any open workspace, whether or not its Git panel has ever been opened.
    // Reconciled the same way the tracker reconciles its own folder set: one
    // subscription per (workspaceId, folder) pair, torn down when that pair
    // stops being open.
    const notifySubs = new Map<string, Disposable>();
    function reconcileNotifications() {
      const state = ctx.workspaces.getState();
      const desired = new Map<
        string,
        { workspaceId: string; folder: string }
      >();
      for (const ws of state.open) {
        for (const folder of [ws.folder, ...(ws.extraFolders ?? [])]) {
          desired.set(`${ws.id}::${folder}`, { workspaceId: ws.id, folder });
        }
      }
      for (const [key, { workspaceId, folder }] of desired) {
        if (notifySubs.has(key)) continue;
        const store = api.watchRepo(folder);
        const addedSub = store.onWorktreeAdded((wt) =>
          notifyNewWorktree(ctx, workspaceId, wt),
        );
        const missingSub = store.onFolderMissing(() =>
          notifyMissingFolder(ctx, workspaceId, folder),
        );
        notifySubs.set(key, {
          dispose: () => {
            addedSub.dispose();
            missingSub.dispose();
            store.dispose();
          },
        });
      }
      for (const [key, sub] of notifySubs) {
        if (!desired.has(key)) {
          sub.dispose();
          notifySubs.delete(key);
        }
      }
    }
    reconcileNotifications();
    ctx.subscriptions.push(ctx.workspaces.subscribe(reconcileNotifications));
    ctx.subscriptions.push({
      dispose: () => {
        for (const sub of notifySubs.values()) sub.dispose();
        notifySubs.clear();
      },
    });

    // Own the git-diff composition: core.editor's diff is generic and asks a
    // registered provider for the two sides. Lives here (the provider) so diffs
    // work even when the git-explorer panel is disabled. Tracked on
    // ctx.subscriptions so disabling git unregisters it (and re-enabling can
    // re-register — the provider registry rejects a duplicate id).
    ctx.subscriptions.push(
      ctx.editors.registerDiffContentProvider("silo.git", async (req) => {
        // Prefer an explicit cwd from the opener (Git panel knows which repo
        // root the row belongs to); otherwise the host's containing workspace
        // folder (correct for multi-root / opened worktrees).
        const folder =
          typeof req.args?.cwd === "string" && req.args.cwd.length > 0
            ? req.args.cwd
            : req.workspaceFolder;
        if (!folder) return { original: "", modified: "" };
        const relative = relativeTo(req.filePath, folder);
        const mode = req.args?.mode as DiffMode | undefined;
        const commit = req.args?.commit as string | undefined;
        const parent = req.args?.parent as string | undefined;
        const commitRef =
          mode === "commit" && commit && parent
            ? { commit, parent }
            : undefined;

        // A binary blob fed straight to the diff editor renders as garbled
        // raw bytes (no text diff makes sense) — check first and short-circuit
        // with a placeholder, same for every mode this provider serves.
        const binary = await api.isBinaryDiff(
          folder,
          relative,
          mode ?? "workingTree",
          commitRef,
        );
        if (binary) {
          const placeholder = "Binary file not shown.";
          return { original: placeholder, modified: placeholder };
        }

        if (commitRef) {
          const [original, modified] = await Promise.all([
            api.show(folder, `${commitRef.parent}:${relative}`),
            api.show(folder, `${commitRef.commit}:${relative}`),
          ]);
          return { original, modified };
        }

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

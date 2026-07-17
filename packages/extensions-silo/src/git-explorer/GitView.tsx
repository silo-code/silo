import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowsClockwise,
  CaretDown,
  CaretRight,
  CloudArrowUp,
  DotsThreeVertical,
} from "@phosphor-icons/react";
import {
  Tooltip,
  useFocusGroup,
  type ExtensionContext,
  type FocusGroupItemProps,
  type MenuEntry,
  type NotifyOptions,
} from "@silo-code/sdk";
import type { GitFileStatus, GitStatus, GitWorktree } from "../git/git-api";
import { getGitApi } from "./git-runtime";
import { Section, FileRow } from "./git-rows";
import { buildGitNavItems, navItemKey } from "./git-nav";
import { ICON_CHECK, ICON_PLUS, ICON_MINUS, ICON_UNDO } from "./git-icons";
import { summarizeGitError } from "./notify-error";
import { GitErrorModal } from "./GitErrorModal";
import { BranchManager } from "./BranchManager";
import { findWorktreeFor } from "./worktree-model";
import { showWorktreeManager } from "./open-worktree-manager";
import { confirmAndRemoveWorktree } from "./confirm-and-remove-worktree";

const REFRESH_DEBOUNCE_MS = 400;
// How often the panel fetches in the background so ↑ahead/↓behind stay roughly
// accurate without the user acting (matches VS Code's git.autofetchPeriod).
const AUTOFETCH_INTERVAL_MS = 180_000;
const statusCache = new Map<string, GitStatus>();
const messageCache = new Map<string, string>();
const worktreeCache = new Map<string, GitWorktree[]>();

export function GitView({
  ctx,
  cacheKey,
  workspaceId,
  folder,
  rootLabel,
  paused,
  collapsed,
  onToggleCollapsed,
}: {
  ctx: ExtensionContext;
  cacheKey: string;
  workspaceId: string;
  folder: string;
  rootLabel?: string;
  paused: boolean;
  collapsed: boolean;
  onToggleCollapsed?: () => void;
}) {
  // Public primitives, read through ctx (stable per extension).
  const editors = ctx.editors;
  const files = ctx.files;
  const [status, setStatus] = useState<GitStatus | null>(
    () => statusCache.get(cacheKey) ?? null,
  );
  const [worktrees, setWorktrees] = useState<GitWorktree[] | null>(
    () => worktreeCache.get(cacheKey) ?? null,
  );
  const [message, setMessage] = useState(
    () => messageCache.get(cacheKey) ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [committing, setCommitting] = useState(false);
  // Mirror `committing` into a ref so the file-watch callback (a stable closure)
  // can skip refreshes while a commit runs — commit() does the final refresh.
  const committingRef = useRef(false);
  useEffect(() => {
    committingRef.current = committing;
  }, [committing]);
  const [pendingRefresh, setPendingRefresh] = useState(false);
  const [pendingPush, setPendingPush] = useState(false);
  const [pendingPull, setPendingPull] = useState(false);
  const [stagedOpen, setStagedOpen] = useState(true);
  const [changesOpen, setChangesOpen] = useState(true);

  const refresh = useCallback(() => {
    setBusy(true);
    setPendingRefresh(true);
  }, []);

  // Surface a git failure as a toast: a short summary, plus a "View details"
  // action that opens the full output in a modal when there's more to show.
  // `transient` auto-dismisses (for passive background refreshes) instead of the
  // sticky default for errors.
  const notifyError = useCallback(
    (title: string, err: unknown, transient = false) => {
      const { detail, summary, hasMore } = summarizeGitError(err, title);
      const options: NotifyOptions = { title };
      if (transient) {
        // Passive background failures auto-dismiss instead of staying sticky.
        options.durationMs = 6000;
      } else if (hasMore) {
        // There's more than the summary line — offer the full output in a modal.
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
    },
    [ctx],
  );

  useEffect(() => {
    setStatus(statusCache.get(cacheKey) ?? null);
    setMessage(messageCache.get(cacheKey) ?? "");
    setWorktrees(worktreeCache.get(cacheKey) ?? null);
    if (!paused) refresh();
  }, [cacheKey, paused, refresh]);

  useEffect(() => {
    messageCache.set(cacheKey, message);
  }, [cacheKey, message]);

  // useEffect runs after paint. The extra setTimeout gives the compositor one
  // tick to start the CSS animation before invoke() can block the JS thread.
  useEffect(() => {
    if (!pendingRefresh) return;
    setPendingRefresh(false);
    const min = new Promise<void>((r) => setTimeout(r, 600));
    setTimeout(() => {
      const api = getGitApi();
      if (!api) {
        notifyError(
          "Git unavailable",
          "Git provider (silo.git) unavailable.",
          true,
        );
        min.then(() => setBusy(false));
        return;
      }
      api
        .status(folder)
        .then((s) => {
          statusCache.set(cacheKey, s);
          setStatus(s);
        })
        .catch((err) => notifyError("Git status failed", err, true))
        .finally(() => min.then(() => setBusy(false)));
      // Also learn whether this folder is a linked worktree (drives the
      // header pill). Cheap read; failures just leave the pill off.
      api
        .worktrees(folder)
        .then((wts) => {
          worktreeCache.set(cacheKey, wts);
          setWorktrees(wts);
        })
        .catch(() => undefined);
    }, 50);
  }, [pendingRefresh, folder, workspaceId, cacheKey, notifyError]);

  useEffect(() => {
    if (!pendingPush) return;
    setPendingPush(false);
    const min = new Promise<void>((r) => setTimeout(r, 600));
    setTimeout(() => {
      const api = getGitApi();
      if (!api) {
        notifyError("Push failed", "Git provider (silo.git) unavailable.");
        min.then(() => setPushing(false));
        return;
      }
      // No upstream yet → first push publishes the branch and sets tracking.
      const opts = status?.upstream ? undefined : { setUpstream: true };
      api
        .push(folder, opts)
        .then(() => {
          setBusy(true);
          setPendingRefresh(true);
        })
        .catch((err) => notifyError("Push failed", err))
        .finally(() => min.then(() => setPushing(false)));
    }, 50);
  }, [pendingPush, folder, notifyError, status?.upstream]);

  useEffect(() => {
    if (!pendingPull) return;
    setPendingPull(false);
    const min = new Promise<void>((r) => setTimeout(r, 600));
    setTimeout(() => {
      const api = getGitApi();
      if (!api) {
        notifyError("Pull failed", "Git provider (silo.git) unavailable.");
        min.then(() => setPulling(false));
        return;
      }
      api
        .pull(folder)
        .then(() => {
          setBusy(true);
          setPendingRefresh(true);
        })
        .catch((err) => {
          // --ff-only aborts when the branch has diverged; there's no in-panel
          // conflict resolution, so point the user at a terminal rather than
          // surfacing git's raw "Not possible to fast-forward".
          if (/fast-forward|diverged|non-fast-forward/i.test(String(err))) {
            notifyError(
              "Pull failed — branch has diverged",
              "Your branch and its upstream have diverged. Reconcile them in a terminal (e.g. `git pull --rebase`), then refresh.",
            );
          } else {
            notifyError("Pull failed", err);
          }
        })
        .finally(() => min.then(() => setPulling(false)));
    }, 50);
  }, [pendingPull, folder, notifyError]);

  useEffect(() => {
    if (paused) return;
    let timer: number | null = null;
    const sub = files.watch(folder, () => {
      // Don't poll mid-commit — the commit (and its pre-commit hooks) churn
      // `.git`, and commit() refreshes once when it's done.
      if (committingRef.current) return;
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(refresh, REFRESH_DEBOUNCE_MS);
    });
    return () => {
      if (timer) window.clearTimeout(timer);
      sub.dispose();
    };
  }, [folder, refresh, paused]);

  // Background autofetch: periodically `git fetch` so ↑ahead/↓behind trend
  // toward accurate without the user acting. Fetch is read-only on the working
  // tree (it only updates remote-tracking refs), so it's safe to run unattended;
  // re-read status quietly (no spinner) so the counts update in place. Failures
  // (offline, no remote) are swallowed — autofetch must stay silent.
  useEffect(() => {
    if (paused) return;
    const id = window.setInterval(() => {
      if (committingRef.current) return;
      const api = getGitApi();
      if (!api) return;
      api
        .fetch(folder)
        .then(() => api.status(folder))
        .then((s) => {
          statusCache.set(cacheKey, s);
          setStatus(s);
        })
        .catch((err) => console.warn("git autofetch failed", err));
    }, AUTOFETCH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [folder, cacheKey, paused]);

  const stagedFiles = useMemo(
    () => status?.files.filter((f) => f.isStaged) ?? [],
    [status],
  );
  const changedFiles = useMemo(
    () => status?.files.filter((f) => f.isModified && !f.isStaged) ?? [],
    [status],
  );

  // The flat, in-render-order list of keyboard-navigable items (section headers
  // + file rows) and a key→index map, so each header/row can claim its focus-
  // group slot. Mirrors the file Tree's flat/indexOfPath pattern.
  const navItems = useMemo(
    () =>
      buildGitNavItems({ stagedFiles, changedFiles, stagedOpen, changesOpen }),
    [stagedFiles, changedFiles, stagedOpen, changesOpen],
  );
  const navIndex = useMemo(() => {
    const m = new Map<string, number>();
    navItems.forEach((it, i) => m.set(navItemKey(it), i));
    return m;
  }, [navItems]);

  // Roving keyboard focus, the WebKit-safe ring, and the single Tab stop are
  // owned by useFocusGroup (same as the file Tree): the headers + file rows are
  // one Tab stop, ↑/↓/Home/End move between them, and Enter/Space toggles a
  // header or opens a row's diff.
  const group = useFocusGroup({
    count: navItems.length,
    orientation: "vertical",
    onActivate: (i) => {
      const it = navItems[i];
      if (!it) return;
      if (it.kind === "header") {
        if (it.section === "staged") setStagedOpen((v) => !v);
        else setChangesOpen((v) => !v);
      } else {
        openFileDiff(
          it.file,
          it.section === "staged" ? "staged" : "workingTree",
        );
      }
    },
  });

  // Focus-group props for the header/row identified by `key`, or undefined when
  // it isn't a current nav item (e.g. a collapsed section's rows aren't rendered).
  function focusPropsFor(key: string): FocusGroupItemProps | undefined {
    const idx = navIndex.get(key);
    return idx === undefined ? undefined : group.getItemProps(idx);
  }

  // The live git provider, or a thrown error the handlers' catch turns into an
  // error toast — keeps "provider absent" from crashing an action.
  function requireGit() {
    const api = getGitApi();
    if (!api) throw new Error("Git provider (silo.git) unavailable.");
    return api;
  }

  async function stageAll() {
    const paths = changedFiles.map((f) => f.path);
    if (paths.length === 0) return;
    try {
      await requireGit().stage(folder, paths);
      refresh();
    } catch (err) {
      notifyError("Stage failed", err);
    }
  }

  async function stage(file: GitFileStatus) {
    try {
      await requireGit().stage(folder, [file.path]);
      refresh();
    } catch (err) {
      notifyError("Stage failed", err);
    }
  }
  async function unstage(file: GitFileStatus) {
    try {
      await requireGit().unstage(folder, [file.path]);
      refresh();
    } catch (err) {
      notifyError("Unstage failed", err);
    }
  }
  async function unstageAll() {
    const paths = stagedFiles.map((f) => f.path);
    if (paths.length === 0) return;
    try {
      await requireGit().unstage(folder, paths);
      refresh();
    } catch (err) {
      notifyError("Unstage failed", err);
    }
  }
  // Discard a file's changes. A tracked file is restored to HEAD; an untracked
  // (new) file has no committed version, so "discard" deletes it. Uses
  // ctx.ui.confirm — the webview's window.confirm is async, so `if (!confirm())`
  // never gates and would run the discard unconfirmed.
  async function revert(file: GitFileStatus) {
    const untracked = file.isUntracked;
    const ok = await ctx.ui.confirm({
      title: untracked
        ? `Delete "${file.path}"?`
        : `Discard changes to "${file.path}"?`,
      body: untracked
        ? "This file is new and untracked — discarding it deletes it permanently."
        : "This restores the file to the last commit and can't be undone.",
      confirmLabel: untracked ? "Delete" : "Discard",
      danger: true,
    });
    if (!ok) return;
    try {
      if (untracked) await requireGit().clean(folder, [file.path]);
      else await requireGit().revertFile(folder, [file.path]);
      refresh();
    } catch (err) {
      notifyError("Discard failed", err);
    }
  }
  // Discard every working-tree change at once: tracked files restored to HEAD,
  // untracked files deleted. Both paths are confirmed by a single dialog.
  async function revertAll() {
    const tracked = changedFiles
      .filter((f) => !f.isUntracked)
      .map((f) => f.path);
    const untracked = changedFiles
      .filter((f) => f.isUntracked)
      .map((f) => f.path);
    const total = tracked.length + untracked.length;
    if (total === 0) return;
    const ok = await ctx.ui.confirm({
      title: `Discard all changes to ${total} file${total === 1 ? "" : "s"}?`,
      body:
        untracked.length > 0
          ? "Tracked files are restored to the last commit; untracked files are deleted permanently. This can't be undone."
          : "This restores the files to the last commit and can't be undone.",
      confirmLabel: "Discard All",
      danger: true,
    });
    if (!ok) return;
    try {
      if (tracked.length > 0) await requireGit().revertFile(folder, tracked);
      if (untracked.length > 0) await requireGit().clean(folder, untracked);
      refresh();
    } catch (err) {
      notifyError("Discard failed", err);
    }
  }
  function openFile(file: GitFileStatus) {
    editors.open(`${folder}/${file.path}`, { workspaceId });
  }
  function openFileDiff(file: GitFileStatus, mode: "workingTree" | "staged") {
    const filePath = `${folder}/${file.path}`;
    const base = file.path.split("/").pop() ?? file.path;
    // Single-click a row → open the diff as a temporary/preview tab (the same
    // single-click behavior text editors have): the next row click replaces it,
    // and double-clicking the tab promotes it to permanent.
    editors.openDiff(
      {
        filePath,
        providerId: "silo.git",
        args: { mode },
        title: mode === "staged" ? `${base} (staged)` : `${base} (diff)`,
      },
      { workspaceId, preview: true },
    );
  }

  function push() {
    setPushing(true);
    setPendingPush(true);
  }

  function pull() {
    setPulling(true);
    setPendingPull(true);
  }

  // Sync = bring remote work in, then send ours. Pull is fast-forward only, so a
  // diverged branch fails here and we never push onto a stale base or strand a
  // half-finished merge — same posture as the standalone Pull/Push.
  async function sync() {
    if (syncing) return;
    setSyncing(true);
    try {
      const api = requireGit();
      await api.pull(folder);
      await api.push(folder);
      refresh();
    } catch (err) {
      if (/fast-forward|diverged|non-fast-forward/i.test(String(err))) {
        notifyError(
          "Sync failed — branch has diverged",
          "Your branch and its upstream have diverged. Reconcile them in a terminal (e.g. `git pull --rebase`), then sync.",
        );
      } else {
        notifyError("Sync failed", err);
      }
    } finally {
      setSyncing(false);
    }
  }

  // Update remote-tracking refs (and thus ↑/↓) without touching the branch.
  async function fetchRemote() {
    try {
      await requireGit().fetch(folder);
      refresh();
    } catch (err) {
      notifyError("Fetch failed", err);
    }
  }

  // The "⋯" dropdown: the explicit Push/Pull (folded off the bar), plus Fetch
  // and ways into the branch and worktree managers. A linked-worktree view
  // additionally offers closing its root and removing the worktree itself.
  function gitMenuItems(): MenuEntry[] {
    const items: MenuEntry[] = [
      { label: pushTitle, disabled: !canPush || pushing, run: push },
      { label: "Pull", disabled: !canPull || pulling, run: pull },
      { type: "separator" },
      { label: "Fetch", run: fetchRemote },
      { type: "separator" },
      { label: "Manage branches…", run: openBranchManager },
      { label: "Manage worktrees…", run: openWorktreeManager },
    ];
    if (linkedWorktree) {
      items.push({ type: "separator" });
      if (isExtraFolder) {
        items.push({
          label: "Close worktree view",
          run: () => ctx.workspaces.removeFolder(workspaceId, folder),
        });
      }
      if (linkedWorktree.locked == null) {
        items.push({
          label: "Remove worktree…",
          danger: true,
          run: () => void removeThisWorktree(),
        });
      }
    }
    return items;
  }

  function openGitMenu(anchor: HTMLElement) {
    void ctx.ui.showMenu({ items: gitMenuItems(), anchor, align: "end" });
  }

  // Open the branch manager modal. The host owns the chrome; refresh() re-reads
  // status after a switch/create so the header reflects the new branch.
  function openBranchManager() {
    ctx.ui.showModal(
      (close) => (
        <BranchManager
          ctx={ctx}
          folder={folder}
          close={close}
          onSwitched={refresh}
          notifyError={notifyError}
        />
      ),
      { title: "Switch branches", size: "md", dismissible: true },
    );
  }

  // Open the worktree manager modal for this repo. Everything inside is
  // parameterized by `folder`, so a multi-root workspace gets an independent
  // manager per repo.
  function openWorktreeManager() {
    showWorktreeManager(ctx, {
      folder,
      workspaceId,
      onChanged: refresh,
    });
  }

  // Remove the worktree this view is rooted in. Runs `git worktree remove`
  // from the main worktree (git refuses to remove the worktree it's run in),
  // then closes this view's root. Dirty trees get a force-remove confirm.
  // Pending-remove UX (StatusBar + close-on-start) lives in confirmAndRemoveWorktree.
  async function removeThisWorktree() {
    const api = getGitApi();
    if (!api) return;
    const mainPath = worktrees?.find((w) => w.isMain)?.path ?? folder;
    await confirmAndRemoveWorktree({
      ctx,
      api,
      cwd: mainPath,
      worktreePath: folder,
      workspaceId,
      isOpen: true,
      notifyError,
      onSuccess: refresh,
    });
  }

  async function commit() {
    if (!message.trim() || committing) return;
    // Reflect the in-flight commit immediately — pre-commit hooks can take a
    // while, so disable the inputs and show progress until it resolves.
    setCommitting(true);
    try {
      await requireGit().commit(folder, message.trim());
      setMessage("");
    } catch (err) {
      notifyError("Commit failed", err);
    } finally {
      setCommitting(false);
      // Refresh once, after the commit settles — both to show the result and to
      // catch any working-tree changes a (failed) pre-commit hook left behind.
      refresh();
    }
  }

  function onCommitKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  }

  if (status && !status.inRepo) {
    return <div className="placeholder">Not a git repository.</div>;
  }

  const canCommit = stagedFiles.length > 0 && message.trim().length > 0;
  // Push is allowed whenever there's a branch (not detached) — including a
  // branch with no upstream yet, where the first push publishes it.
  const canPush = !!status?.branch;
  const pushTitle = status?.upstream ? "Push" : "Publish branch";
  // Pull needs a tracking branch to pull from; the menu item is disabled
  // (not hidden) otherwise.
  const canPull = !!status?.upstream;
  // This view's folder is a *linked* worktree of its repo (not the main one) —
  // drives the header pill and the extra menu entries.
  const linkedWorktree = (() => {
    const wt = worktrees ? findWorktreeFor(folder, worktrees) : undefined;
    return wt && !wt.isMain ? wt : undefined;
  })();
  // A linked worktree opened alongside is an extra folder; the host no-ops
  // removeFolder on the primary, so only offer "close" for extras.
  const isExtraFolder = (() => {
    const ws = ctx.workspaces.getState().all.find((w) => w.id === workspaceId);
    return ws ? ws.folder !== folder : false;
  })();

  return (
    <div className="git-panel">
      {rootLabel ? (
        <button className="git-root-label" onClick={onToggleCollapsed}>
          <span className="git-root-top">
            <span className="git-root-chev">
              {collapsed ? (
                <CaretRight size="0.85em" weight="bold" />
              ) : (
                <CaretDown size="0.85em" weight="bold" />
              )}
            </span>
            <span className="git-root-name">{rootLabel.toUpperCase()}</span>
          </span>
          {status?.inRepo && (
            <span
              className="git-root-bottom"
              onClick={(e) => e.stopPropagation()}
            >
              <span className="git-root-branch-wrap">
                <Tooltip content="Manage branches">
                  <span
                    className="git-root-branch clickable"
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      openBranchManager();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        openBranchManager();
                      }
                    }}
                  >
                    {status.branch ?? "(detached)"}
                  </span>
                </Tooltip>
              </span>
              {linkedWorktree && (
                <Tooltip content={`Linked worktree at ${folder}`}>
                  <span className="git-wt-pill">worktree</span>
                </Tooltip>
              )}
              <span
                className="git-root-remote"
                onClick={(e) => e.stopPropagation()}
              >
                {status?.upstream ? (
                  <Tooltip content="Sync (pull, then push)">
                    <button
                      className={`branch-tracking branch-sync${syncing ? " working" : ""}`}
                      onClick={syncing ? undefined : sync}
                    >
                      {syncing && (
                        <ArrowsClockwise
                          className="git-branch-spin"
                          size={12}
                        />
                      )}
                      ↑{status.ahead} ↓{status.behind}
                    </button>
                  </Tooltip>
                ) : status.branch ? (
                  <Tooltip content="Publish branch">
                    <button
                      className={`branch-action branch-publish push-btn${pushing ? " working" : ""}`}
                      onClick={pushing ? undefined : push}
                    >
                      <CloudArrowUp size={16} />
                    </button>
                  </Tooltip>
                ) : null}
              </span>
              <span
                className="git-root-actions"
                onClick={(e) => e.stopPropagation()}
              >
                <Tooltip content="Refresh">
                  <button
                    className={`branch-action refresh-btn${busy ? " working" : ""}`}
                    onClick={busy ? undefined : refresh}
                  >
                    <ArrowsClockwise size={14} />
                  </button>
                </Tooltip>
                <Tooltip content="More actions">
                  <button
                    className="branch-action git-menu-btn"
                    onClick={(e) => openGitMenu(e.currentTarget)}
                  >
                    <DotsThreeVertical size={18} weight="bold" />
                  </button>
                </Tooltip>
              </span>
            </span>
          )}
        </button>
      ) : (
        <div className="git-branch">
          <span className="git-branch-name-wrap">
            {status?.inRepo ? (
              <Tooltip content="Manage branches">
                <button
                  className="branch-name branch-name-button"
                  onClick={openBranchManager}
                >
                  {status.branch ?? "(detached)"}
                </button>
              </Tooltip>
            ) : (
              <span className="branch-name">
                {status ? (status.branch ?? "(detached)") : "Loading…"}
              </span>
            )}
          </span>
          {linkedWorktree && (
            <Tooltip content={`Linked worktree at ${folder}`}>
              <span className="git-wt-pill">worktree</span>
            </Tooltip>
          )}
          {/* Where the remote state lives: published → the ↑/↓ counts double as
              a Sync button; not yet published → a Publish-branch button. */}
          {status?.upstream ? (
            <Tooltip content="Sync (pull, then push)">
              <button
                className={`branch-tracking branch-sync${syncing ? " working" : ""}`}
                onClick={syncing ? undefined : sync}
              >
                {syncing && (
                  <ArrowsClockwise className="git-branch-spin" size={12} />
                )}
                ↑{status.ahead} ↓{status.behind}
              </button>
            </Tooltip>
          ) : status?.inRepo && status.branch ? (
            <Tooltip content="Publish branch">
              <button
                className={`branch-action branch-publish push-btn${pushing ? " working" : ""}`}
                onClick={pushing ? undefined : push}
              >
                <CloudArrowUp size={16} />
              </button>
            </Tooltip>
          ) : null}
          <Tooltip content="Refresh">
            <button
              className={`branch-action refresh-btn${busy ? " working" : ""}`}
              onClick={busy ? undefined : refresh}
            >
              <ArrowsClockwise size={16} />
            </button>
          </Tooltip>
          {status?.inRepo && (
            <Tooltip content="More actions">
              <button
                className="branch-action git-menu-btn"
                onClick={(e) => openGitMenu(e.currentTarget)}
              >
                <DotsThreeVertical size={18} weight="bold" />
              </button>
            </Tooltip>
          )}
        </div>
      )}
      {!collapsed && (
        <>
          <div className="commit-area">
            <textarea
              value={message}
              placeholder="Commit message"
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={onCommitKeyDown}
              rows={2}
              disabled={committing}
              autoCapitalize="off"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              className="commit-btn silo-button-primary"
              disabled={!canCommit || committing}
              onClick={commit}
            >
              {committing ? (
                <ArrowsClockwise size={16} className="git-branch-spin" />
              ) : (
                ICON_CHECK
              )}{" "}
              <span>{committing ? "Committing…" : "Commit"}</span>
              {!committing && stagedFiles.length > 0 && (
                <span className="commit-count">{stagedFiles.length}</span>
              )}
            </button>
          </div>

          {/* Disable file actions while a commit (incl. pre-commit hooks) runs,
              so an interaction can't race the locked index. */}
          <div
            className={`git-sections${committing ? " busy" : ""}`}
            aria-busy={committing}
            {...group.containerProps}
          >
            {stagedFiles.length > 0 && (
              <Section
                title="Staged Changes"
                count={stagedFiles.length}
                open={stagedOpen}
                onToggle={() => setStagedOpen((v) => !v)}
                focusProps={focusPropsFor("h:staged")}
                actions={[
                  {
                    icon: ICON_MINUS,
                    title: "Unstage all changes",
                    onClick: () => unstageAll(),
                  },
                ]}
              >
                {stagedFiles.map((f) => (
                  <FileRow
                    key={`s-${f.path}`}
                    file={f}
                    folder={folder}
                    kind="staged"
                    onRowClick={() => openFileDiff(f, "staged")}
                    onOpen={() => openFile(f)}
                    onUnstage={() => unstage(f)}
                    focusProps={focusPropsFor(`r:staged:${f.path}`)}
                  />
                ))}
              </Section>
            )}

            <Section
              title="Changes"
              count={changedFiles.length}
              open={changesOpen}
              onToggle={() => setChangesOpen((v) => !v)}
              focusProps={focusPropsFor("h:changes")}
              actions={
                changedFiles.length > 0
                  ? [
                      {
                        icon: ICON_UNDO,
                        title: "Discard all changes",
                        onClick: () => revertAll(),
                      },
                      {
                        icon: ICON_PLUS,
                        title: "Stage all changes",
                        onClick: () => stageAll(),
                      },
                    ]
                  : undefined
              }
            >
              {changedFiles.length === 0 && (
                <div className="empty">No changes.</div>
              )}
              {changedFiles.map((f) => (
                <FileRow
                  key={`c-${f.path}`}
                  file={f}
                  folder={folder}
                  kind="changes"
                  onRowClick={() => openFileDiff(f, "workingTree")}
                  onOpen={() => openFile(f)}
                  onStage={() => stage(f)}
                  onRevert={() => revert(f)}
                  focusProps={focusPropsFor(`r:changes:${f.path}`)}
                />
              ))}
            </Section>
          </div>
        </>
      )}
    </div>
  );
}

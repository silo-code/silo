import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowsClockwise, CaretDown, CaretRight } from "@phosphor-icons/react";
import {
  Badge,
  Tooltip,
  useFocusGroup,
  useServiceState,
  type ExtensionContext,
  type ExtensionStorage,
  type FocusGroupItemProps,
  type MenuEntry,
  type NotifyOptions,
} from "@silo-code/sdk";
import type { GitAPI, GitFileStatus } from "@silo-code/git-api";
import { NULL_GIT_REPO_STORE } from "@silo-code/git-api";
import { Section, FileRow } from "./git-rows";
import { GitSyncOrPublishButton, GitHeaderActions } from "./git-header";
import { buildGitNavItems, navItemKey } from "./git-nav";
import { ICON_CHECK, ICON_PLUS, ICON_MINUS, ICON_UNDO } from "./git-icons";
import { summarizeGitError } from "./notify-error";
import { GitErrorModal } from "./GitErrorModal";
import { BranchManager } from "./BranchManager";
import {
  findWorktreeFor,
  shouldShowWorktreeManagerButton,
  worktreeManagerButtonTooltip,
} from "./worktree-model";
import { showWorktreeManager } from "./open-worktree-manager";
import { confirmAndRemoveWorktree } from "./confirm-and-remove-worktree";
import { useViewStack } from "./use-view-stack";
import { CommitsTakeover } from "./CommitsTakeover";
import { shouldExitTakeover, shouldPushCommitsOnOpen } from "./takeover-model";

const messageCache = new Map<string, string>();

export function GitView({
  ctx,
  cacheKey,
  workspaceId,
  folder,
  rootLabel,
  collapsed,
  onToggleCollapsed,
  storage,
  hydrated,
  isTakeoverActive,
  onEnterTakeover,
  onExitTakeover,
}: {
  ctx: ExtensionContext;
  cacheKey: string;
  workspaceId: string;
  folder: string;
  rootLabel?: string;
  collapsed: boolean;
  onToggleCollapsed?: () => void;
  storage: ExtensionStorage;
  hydrated: boolean;
  /** Whether *this* repo is the one panel-wide "View Commits" takeover
   * (only one repo can cover the panel at a time — see GitExplorerPanel). */
  isTakeoverActive: boolean;
  onEnterTakeover: () => void;
  onExitTakeover: () => void;
}) {
  // "View Commits" list/detail navigation — keyed per repo root (cacheKey) so
  // a multi-root workspace's git roots don't share one stack.
  const viewStack = useViewStack(storage, `view:${cacheKey}`, hydrated);
  // The takeover auto-closes once this repo's stack pops back to root, from
  // Back, Escape, or any other path — see takeover-model.ts.
  useEffect(() => {
    if (shouldExitTakeover(isTakeoverActive, viewStack.view)) onExitTakeover();
  }, [isTakeoverActive, viewStack.view, onExitTakeover]);
  // Public primitives, read through ctx (stable per extension).
  const editors = ctx.editors;

  // ADR 0037: the live watch session. Safe to call every render — watchRepo
  // is idempotent by cwd, and lifecycle is tied to this subscription (via
  // useServiceState), not to how many times watchRepo() is called. Ambient
  // and workspace-activation-driven: this repo's data is already fresh even
  // if this panel was never opened before now.
  const gitApi = ctx.getExtension<GitAPI>("silo.git")?.api;
  const store = gitApi?.watchRepo(folder) ?? NULL_GIT_REPO_STORE;
  const { status, worktrees, loading: busy, error } = useServiceState(store);

  const [message, setMessage] = useState(
    () => messageCache.get(cacheKey) ?? "",
  );
  const [pushing, setPushing] = useState(false);
  const [pulling, setPulling] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [stagedOpen, setStagedOpen] = useState(true);
  const [changesOpen, setChangesOpen] = useState(true);

  const refresh = useCallback(() => {
    // The null store (no `silo.git` provider) always rejects; nothing more
    // to surface here than the "Not a git repository" placeholder already shows.
    void store.refresh().catch(() => {});
  }, [store]);

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

  // Surface a background status/worktrees read failure (fs-watch debounce,
  // autofetch, or the tracker's own initial read) — the only path that ever
  // sees these, since every foreground action (stage/commit/push/…) already
  // catches and toasts its own error.
  useEffect(() => {
    if (!error) return;
    notifyError(
      error.op === "status" ? "Git status failed" : "Reading worktrees failed",
      error.cause,
      true,
    );
  }, [error, notifyError]);

  useEffect(() => {
    messageCache.set(cacheKey, message);
  }, [cacheKey, message]);

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

  async function stageAll() {
    const paths = changedFiles.map((f) => f.path);
    if (paths.length === 0) return;
    try {
      await store.stage(paths);
    } catch (err) {
      notifyError("Stage failed", err);
    }
  }

  async function stage(file: GitFileStatus) {
    try {
      await store.stage([file.path]);
    } catch (err) {
      notifyError("Stage failed", err);
    }
  }
  async function unstage(file: GitFileStatus) {
    try {
      await store.unstage([file.path]);
    } catch (err) {
      notifyError("Unstage failed", err);
    }
  }
  async function unstageAll() {
    const paths = stagedFiles.map((f) => f.path);
    if (paths.length === 0) return;
    try {
      await store.unstage(paths);
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
      if (untracked) await store.clean([file.path]);
      else await store.revertFile([file.path]);
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
      if (tracked.length > 0) await store.revertFile(tracked);
      if (untracked.length > 0) await store.clean(untracked);
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
        // cwd pins the git root for this row (worktree vs primary) so the
        // content provider doesn't rely solely on the workspace primary folder.
        args: { mode, cwd: folder },
        title: mode === "staged" ? `${base} (staged)` : `${base} (diff)`,
      },
      { workspaceId, preview: true },
    );
  }

  async function push() {
    setPushing(true);
    try {
      await store.push(status?.upstream ? undefined : { setUpstream: true });
    } catch (err) {
      notifyError("Push failed", err);
    } finally {
      setPushing(false);
    }
  }

  async function pull() {
    setPulling(true);
    try {
      await store.pull();
    } catch (err) {
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
    } finally {
      setPulling(false);
    }
  }

  // Sync = bring remote work in, then send ours. Pull is fast-forward only, so a
  // diverged branch fails here and we never push onto a stale base or strand a
  // half-finished merge — same posture as the standalone Pull/Push.
  async function sync() {
    if (syncing) return;
    setSyncing(true);
    try {
      await store.pull();
      await store.push();
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
      await store.fetch();
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
      {
        label: "View Commits",
        run: () => {
          // A repo left mid-drill (persisted per-repo) resumes as-is instead
          // of restarting the list — see takeover-model.ts.
          if (shouldPushCommitsOnOpen(viewStack.view)) {
            viewStack.push({ kind: "commits" });
          }
          onEnterTakeover();
        },
      },
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
      // Offered for a locked worktree too — the remove flow confirms clearing
      // the lock rather than the action silently going missing.
      items.push({
        label: "Remove worktree…",
        danger: true,
        run: () => void removeThisWorktree(),
      });
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
    if (!gitApi) return;
    const mainPath = worktrees?.find((w) => w.isMain)?.path ?? folder;
    await confirmAndRemoveWorktree({
      ctx,
      store: gitApi.watchRepo(mainPath),
      worktreePath: folder,
      workspaceId,
      isOpen: true,
      locked: linkedWorktree?.locked ?? null,
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
      await store.commit(message.trim());
      setMessage("");
    } catch (err) {
      notifyError("Commit failed", err);
    } finally {
      setCommitting(false);
    }
  }

  function onCommitKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  }

  // A folder with no git status to show — either not a repo, or (missing)
  // gone from disk entirely (deleted/removed outside Silo). Still render the
  // collapsible root header when there is one, so a multi-root panel keeps
  // showing *which* folder this is instead of the section vanishing outright.
  if (status && !status.inRepo) {
    return (
      <div className="git-panel">
        {rootLabel && (
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
          </button>
        )}
        {!collapsed && (
          <div className="placeholder">
            {status.missing
              ? "This folder could not be found."
              : "Not a git repository."}
          </div>
        )}
      </div>
    );
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
  // Shortcut icon only on the main worktree view — linked views use the
  // clickable "worktree" pill instead (avoids icon + pill redundancy).
  const showWorktreeButton =
    !linkedWorktree && shouldShowWorktreeManagerButton(worktrees);
  // A linked worktree opened alongside is an extra folder; the host no-ops
  // removeFolder on the primary, so only offer "close" for extras.
  const isExtraFolder = (() => {
    const ws = ctx.workspaces.getState().all.find((w) => w.id === workspaceId);
    return ws ? ws.folder !== folder : false;
  })();

  const worktreePill = linkedWorktree ? (
    <Tooltip content={worktreeManagerButtonTooltip(worktrees)}>
      <button
        type="button"
        className="git-wt-pill-btn"
        onClick={(e) => {
          e.stopPropagation();
          openWorktreeManager();
        }}
      >
        <Badge tone="accent">WT</Badge>
      </button>
    </Tooltip>
  ) : null;

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
              {worktreePill}
              <span
                className="git-root-remote"
                onClick={(e) => e.stopPropagation()}
              >
                <GitSyncOrPublishButton
                  status={status}
                  syncing={syncing}
                  pushing={pushing}
                  onSync={sync}
                  onPublish={push}
                />
              </span>
              <span
                className="git-root-actions"
                onClick={(e) => e.stopPropagation()}
              >
                <GitHeaderActions
                  size={14}
                  busy={busy}
                  onRefresh={refresh}
                  showWorktreeButton={showWorktreeButton}
                  worktreeTooltip={worktreeManagerButtonTooltip(worktrees)}
                  onOpenWorktreeManager={openWorktreeManager}
                  showMenu // already inside a status?.inRepo guard one level up
                  onOpenMenu={openGitMenu}
                />
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
          {worktreePill}
          {/* Where the remote state lives: published → the ↑/↓ counts double as
              a Sync button; not yet published → a Publish-branch button. */}
          <GitSyncOrPublishButton
            status={status}
            syncing={syncing}
            pushing={pushing}
            onSync={sync}
            onPublish={push}
          />
          <GitHeaderActions
            size={16}
            busy={busy}
            onRefresh={refresh}
            showWorktreeButton={showWorktreeButton}
            worktreeTooltip={worktreeManagerButtonTooltip(worktrees)}
            onOpenWorktreeManager={openWorktreeManager}
            showMenu={!!status?.inRepo} // hidden while status is still loading
            onOpenMenu={openGitMenu}
          />
        </div>
      )}
      {!collapsed && (
        <div
          className="git-panel-root"
          aria-hidden={isTakeoverActive || undefined}
        >
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
        </div>
      )}
      <CommitsTakeover
        ctx={ctx}
        folder={folder}
        workspaceId={workspaceId}
        status={status}
        viewStack={viewStack}
        isActive={isTakeoverActive}
        branchLabel={status?.branch ?? "(detached)"}
        worktreePill={worktreePill}
      />
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowsClockwise,
  CaretDown,
  CaretRight,
  CloudArrowUp,
} from "@phosphor-icons/react";
import type { ExtensionContext, NotifyOptions } from "@silo-code/sdk";
import type { GitFileStatus, GitStatus } from "../git/git-api";
import { getGitApi } from "./git-runtime";
import { Section, FileRow } from "./git-rows";
import {
  ICON_CHECK,
  ICON_PUSH,
  ICON_PLUS,
  ICON_MINUS,
  ICON_UNDO,
} from "./git-icons";
import { summarizeGitError } from "./notify-error";
import { BranchManager } from "./BranchManager";

const REFRESH_DEBOUNCE_MS = 400;
const statusCache = new Map<string, GitStatus>();
const messageCache = new Map<string, string>();

export function GitView({
  ctx,
  cacheKey,
  workspaceId,
  folder,
  rootLabel,
  paused,
}: {
  ctx: ExtensionContext;
  cacheKey: string;
  workspaceId: string;
  folder: string;
  rootLabel?: string;
  paused: boolean;
}) {
  // Public primitives, read through ctx (stable per extension).
  const editors = ctx.editors;
  const files = ctx.files;
  const [status, setStatus] = useState<GitStatus | null>(
    () => statusCache.get(cacheKey) ?? null,
  );
  const [message, setMessage] = useState(
    () => messageCache.get(cacheKey) ?? "",
  );
  const [busy, setBusy] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [committing, setCommitting] = useState(false);
  // Mirror `committing` into a ref so the file-watch callback (a stable closure)
  // can skip refreshes while a commit runs — commit() does the final refresh.
  const committingRef = useRef(false);
  useEffect(() => {
    committingRef.current = committing;
  }, [committing]);
  const [pendingRefresh, setPendingRefresh] = useState(false);
  const [pendingPush, setPendingPush] = useState(false);
  const [stagedOpen, setStagedOpen] = useState(true);
  const [changesOpen, setChangesOpen] = useState(true);
  const [collapsed, setCollapsed] = useState(false);

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
                (close) => (
                  <>
                    <pre className="git-error-detail">{detail}</pre>
                    <div className="silo-modal-actions">
                      <button
                        type="button"
                        className="silo-button-primary"
                        onClick={() => close()}
                      >
                        Close
                      </button>
                    </div>
                  </>
                ),
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

  const stagedFiles = useMemo(
    () => status?.files.filter((f) => f.isStaged) ?? [],
    [status],
  );
  const changedFiles = useMemo(
    () => status?.files.filter((f) => f.isModified && !f.isStaged) ?? [],
    [status],
  );

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
      { title: "Switch branches", size: "lg", dismissible: true },
    );
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
  // A cloud-up glyph marks "publish" (first push, no upstream); the plain
  // up-arrow is a normal push to an existing remote branch.
  const pushIcon = status?.upstream ? ICON_PUSH : <CloudArrowUp size={16} />;

  return (
    <div className="git-panel">
      {rootLabel ? (
        <button
          className="git-root-label"
          onClick={() => setCollapsed((v) => !v)}
        >
          <span className="git-root-chev">
            {collapsed ? (
              <CaretRight size="0.85em" weight="bold" />
            ) : (
              <CaretDown size="0.85em" weight="bold" />
            )}
          </span>
          <span className="git-root-name">{rootLabel.toUpperCase()}</span>
          <span
            className={`git-root-branch${status?.inRepo ? " clickable" : ""}`}
            role={status?.inRepo ? "button" : undefined}
            tabIndex={status?.inRepo ? 0 : undefined}
            title={status?.inRepo ? "Manage branches" : undefined}
            onClick={
              status?.inRepo
                ? (e) => {
                    e.stopPropagation();
                    openBranchManager();
                  }
                : undefined
            }
            onKeyDown={
              status?.inRepo
                ? (e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      e.stopPropagation();
                      openBranchManager();
                    }
                  }
                : undefined
            }
          >
            {status ? (status.branch ?? "(detached)") : ""}
            {status?.upstream && (
              <span className="branch-tracking">
                {" "}
                ↑{status.ahead} ↓{status.behind}
              </span>
            )}
          </span>
          <span
            className="git-root-actions"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className={`branch-action refresh-btn${busy ? " working" : ""}`}
              title="Refresh"
              onClick={busy ? undefined : refresh}
            >
              <ArrowsClockwise size={14} />
            </button>
            <button
              className={`branch-action push-btn${pushing ? " working" : ""}${!pushing && !canPush ? " disabled" : ""}`}
              title={pushTitle}
              onClick={pushing || !canPush ? undefined : push}
            >
              {pushIcon}
            </button>
          </span>
        </button>
      ) : (
        <div className="git-branch">
          {status?.inRepo ? (
            <button
              className="branch-name branch-name-button"
              title="Manage branches"
              onClick={openBranchManager}
            >
              {status.branch ?? "(detached)"}
            </button>
          ) : (
            <span className="branch-name">
              {status ? (status.branch ?? "(detached)") : "Loading…"}
            </span>
          )}
          {status?.upstream && (
            <span className="branch-tracking">
              ↑{status.ahead} ↓{status.behind}
            </span>
          )}
          <span className="spacer" />
          <button
            className={`branch-action refresh-btn${busy ? " working" : ""}`}
            title="Refresh"
            onClick={busy ? undefined : refresh}
          >
            <ArrowsClockwise size={16} />
          </button>
          <button
            className={`branch-action push-btn${pushing ? " working" : ""}${!pushing && !canPush ? " disabled" : ""}`}
            title={pushTitle}
            onClick={pushing || !canPush ? undefined : push}
          >
            {pushIcon}
          </button>
        </div>
      )}
      {!collapsed && (
        <>
          <div className="commit-area">
            <textarea
              value={message}
              placeholder={`Message (⌘Enter to commit${status?.branch ? ` on "${status.branch}"` : ""})`}
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
          >
            {stagedFiles.length > 0 && (
              <Section
                title="Staged Changes"
                count={stagedFiles.length}
                open={stagedOpen}
                onToggle={() => setStagedOpen((v) => !v)}
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
                  />
                ))}
              </Section>
            )}

            <Section
              title="Changes"
              count={changedFiles.length}
              open={changesOpen}
              onToggle={() => setChangesOpen((v) => !v)}
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
                />
              ))}
            </Section>
          </div>
        </>
      )}
    </div>
  );
}

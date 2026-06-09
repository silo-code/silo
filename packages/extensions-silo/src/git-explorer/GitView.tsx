import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowsClockwise, CaretDown, CaretRight } from "@phosphor-icons/react";
import type { ExtensionContext, NotifyOptions } from "@silo-code/sdk";
import type { GitFileStatus, GitStatus } from "../git/git-api";
import { getGitApi } from "./git-runtime";
import { Section, FileRow } from "./git-rows";
import { ICON_CHECK, ICON_PUSH } from "./git-icons";
import { summarizeGitError } from "./notify-error";

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
      api
        .push(folder)
        .then(() => {
          setBusy(true);
          setPendingRefresh(true);
        })
        .catch((err) => notifyError("Push failed", err))
        .finally(() => min.then(() => setPushing(false)));
    }, 50);
  }, [pendingPush, folder, notifyError]);

  useEffect(() => {
    if (paused) return;
    let timer: number | null = null;
    const sub = files.watch(folder, () => {
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
  async function revert(file: GitFileStatus) {
    if (!confirm(`Discard changes to "${file.path}"? This cannot be undone.`))
      return;
    try {
      await requireGit().revertFile(folder, [file.path]);
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

  async function commit() {
    if (!message.trim()) return;
    try {
      await requireGit().commit(folder, message.trim());
      setMessage("");
      refresh();
    } catch (err) {
      notifyError("Commit failed", err);
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
          <span className="git-root-branch">
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
              className={`branch-action push-btn${pushing ? " working" : ""}${!pushing && !status?.upstream ? " disabled" : ""}`}
              title="Push"
              onClick={pushing || !status?.upstream ? undefined : push}
            >
              {ICON_PUSH}
            </button>
          </span>
        </button>
      ) : (
        <div className="git-branch">
          <span className="branch-name">
            {status ? (status.branch ?? "(detached)") : "Loading…"}
          </span>
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
            className={`branch-action push-btn${pushing ? " working" : ""}${!pushing && !status?.upstream ? " disabled" : ""}`}
            title="Push"
            onClick={pushing || !status?.upstream ? undefined : push}
          >
            {ICON_PUSH}
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
            />
            <button
              className="commit-btn silo-button-primary"
              disabled={!canCommit}
              onClick={commit}
            >
              {ICON_CHECK} <span>Commit</span>
              {stagedFiles.length > 0 && (
                <span className="commit-count">{stagedFiles.length}</span>
              )}
            </button>
          </div>

          {stagedFiles.length > 0 && (
            <Section
              title="Staged Changes"
              count={stagedFiles.length}
              open={stagedOpen}
              onToggle={() => setStagedOpen((v) => !v)}
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
            onAdd={changedFiles.length > 0 ? () => stageAll() : undefined}
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
        </>
      )}
    </div>
  );
}

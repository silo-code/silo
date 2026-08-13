import {
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  ArrowsClockwise,
  Broom,
  FolderSimple,
  Plus,
  Trash,
  X,
} from "@phosphor-icons/react";
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  IconButton,
  List,
  ListRow,
  ModalActions,
  Tooltip,
  path,
  useServiceState,
  type ExtensionContext,
} from "@silo-code/sdk";
import type { GitAPI } from "@silo-code/git-api";
import { NULL_GIT_REPO_STORE } from "@silo-code/git-api";
import { confirmAndRemoveWorktree } from "./confirm-and-remove-worktree";
import {
  clearSuppressedNewWorktreeNotification,
  suppressNewWorktreeNotification,
} from "./notify-new-worktree";
import {
  getPendingWorktreeRemoves,
  isWorktreeRemovePending,
  subscribePendingWorktreeRemoves,
  subscribeWorktreeListDirty,
} from "./pending-worktree-remove";
import {
  branchesInUse,
  buildWorktreeRows,
  isOnlyMainWorktree,
  normalizeFolderPath,
  orphanCandidateFolders,
  orphanOpenFolders,
  worktreeActions,
  type WorktreeRow,
} from "./worktree-model";
import {
  WorktreeCreateDialog,
  isWorktreeCreateResult,
  type WorktreeCreateResult,
} from "./WorktreeCreateDialog";

export interface WorktreeManagerProps {
  ctx: ExtensionContext;
  /** The repo working directory whose worktrees are managed. */
  folder: string;
  workspaceId: string;
  /** Called after a create/remove so the panel re-reads status. */
  onChanged: () => void;
  /** Surface a git failure as a toast (reuses the view's helper). */
  notifyError: (title: string, err: unknown) => void;
}

/**
 * Content of the worktree manager modal (`ctx.ui.showModal`). Lists every
 * working tree of the repo (main first); click a row to open it **alongside**
 * the current folders (`ctx.workspaces.addFolder` — File Explorer and the Git
 * panel grow an extra root), trailing IconButtons for prune / remove, and
 * create or prune from the footer. The host owns the surrounding modal chrome.
 */
export function WorktreeManager({
  ctx,
  folder,
  workspaceId,
  onChanged,
  notifyError,
}: WorktreeManagerProps) {
  const [busy, setBusy] = useState(false);
  // Pending removes outlive this modal — subscribe so rows flip to Removing…
  // if the user dismissed and reopened mid-delete.
  useSyncExternalStore(
    subscribePendingWorktreeRemoves,
    getPendingWorktreeRemoves,
    getPendingWorktreeRemoves,
  );

  // Live workspace state so rows flip to "open" immediately after addFolder.
  const wsState = useServiceState(ctx.workspaces);
  const ws = wsState.all.find((w) => w.id === workspaceId) ?? null;
  const wsFolder = ws?.folder ?? folder;
  const allFolders = useMemo(
    () => (ws ? [ws.folder, ...(ws.extraFolders ?? [])] : [folder]),
    [ws, folder],
  );

  // ADR 0037: live worktree list, ambient/shared with any other consumer of
  // this same folder (e.g. an open Git view) — a create/remove from either
  // place updates both, no manual reload bus needed for that case.
  const gitApi = ctx.getExtension<GitAPI>("silo.git")?.api;
  const store = gitApi?.watchRepo(folder) ?? NULL_GIT_REPO_STORE;
  const { worktrees } = useServiceState(store);

  // Still needed for a remove that runs from a *different* folder's store
  // (Git view's "Remove worktree…" resolves the main worktree's cwd, which
  // may differ from this modal's own `folder` — see confirmAndRemoveWorktree
  // callers) — that store's own auto-refresh doesn't touch this one.
  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeWorktreeListDirty(() => {
      // The null store (no `silo.git` provider) always rejects; nothing more
      // to surface here than the modal's own "Loading worktrees…" state.
      if (active) void store.refresh().catch(() => {});
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [store]);

  const rows = useMemo(
    () => buildWorktreeRows(worktrees ?? [], folder, wsFolder, allFolders),
    [worktrees, folder, wsFolder, allFolders],
  );

  // Folders open in the workspace but absent from this repo's worktree list
  // are candidates for "missing on disk" — but absence alone doesn't prove
  // it; an unrelated folder (a second repo attached to the same workspace)
  // looks identical to git. Confirm each candidate against disk before
  // treating it as an orphaned worktree directory rather than just leaving it
  // out of this modal entirely.
  const orphanCandidates = useMemo(
    () => orphanCandidateFolders(rows, allFolders, wsFolder),
    [rows, allFolders, wsFolder],
  );
  const [missingOnDisk, setMissingOnDisk] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (orphanCandidates.length === 0) {
      setMissingOnDisk(new Set());
      return;
    }
    let active = true;
    void (async () => {
      const missing = new Set<string>();
      await Promise.all(
        orphanCandidates.map(async (f) => {
          // Fail open on a read error — don't offer to drop a folder we
          // couldn't actually confirm is gone.
          const exists = await ctx.files.pathExists(f).catch(() => true);
          if (!exists) missing.add(normalizeFolderPath(f));
        }),
      );
      if (active) setMissingOnDisk(missing);
    })();
    return () => {
      active = false;
    };
  }, [orphanCandidates, ctx.files]);

  const displayRows = useMemo(
    () => [
      ...rows,
      ...orphanOpenFolders(rows, allFolders, wsFolder, folder, missingOnDisk),
    ],
    [rows, allFolders, wsFolder, folder, missingOnDisk],
  );
  const anyPrunable = displayRows.some((r) => r.wt.prunable != null);

  // Open alongside: the worktree becomes another workspace folder, so File
  // Explorer and the Git panel grow an extra root. The scope roots follow the
  // folder list, so files/terminals in the worktree work immediately.
  async function open(row: WorktreeRow) {
    if (busy || isWorktreeRemovePending(row.wt.path)) return;
    ctx.workspaces.addFolder(workspaceId, row.wt.path);
    ctx.ui.notify("info", `Opened ${path.basename(row.wt.path)} alongside`);
  }

  // Close worktree view: drop the folder from the workspace; leave disk alone.
  function closeWorktreeView(row: WorktreeRow) {
    if (isWorktreeRemovePending(row.wt.path)) return;
    ctx.workspaces.removeFolder(workspaceId, row.wt.path);
  }

  // Clicking a row toggles open-alongside: open if closed, close if open.
  // The primary folder and stale (prune-only) rows toggle nothing.
  function toggleOpenAlongside(row: WorktreeRow) {
    const acts = worktreeActions(row, isWorktreeRemovePending(row.wt.path));
    if (acts.includes("open")) void open(row);
    else if (acts.includes("close")) closeWorktreeView(row);
  }

  async function create() {
    if (busy) return;
    const used = branchesInUse(worktrees ?? []);
    let available: string[] = [];
    try {
      available = (await store.api.branches(folder))
        .filter((b) => !b.remote && !used.has(b.name))
        .map((b) => b.name);
    } catch {
      // No branch list (e.g. empty repo) — the dialog still allows a new branch.
    }
    const result = await ctx.ui.showModal<WorktreeCreateResult>(
      (closeDialog) => (
        <WorktreeCreateDialog
          ctx={ctx}
          folder={folder}
          availableBranches={available}
          close={closeDialog}
        />
      ),
      { title: "Create worktree", dismissible: true, size: "sm" },
    );
    if (!isWorktreeCreateResult(result)) return;
    setBusy(true);
    // The store's own trailing refresh fires onWorktreeAdded (and thus the
    // "new worktree detected" toast) synchronously as part of the awaited
    // addWorktree() below — before this function ever reaches the
    // ctx.workspaces.addFolder() call that would otherwise suppress it via
    // the "already open" check. Mark it here instead, up front.
    suppressNewWorktreeNotification(result.path);
    try {
      await store.addWorktree(
        result.path,
        "existing" in result.branch
          ? { branch: result.branch.existing }
          : { newBranch: result.branch.create },
      );
      ctx.workspaces.addFolder(workspaceId, result.path);
      ctx.ui.notify(
        "info",
        `Created worktree ${path.basename(result.path)} and opened it alongside`,
      );
      onChanged();
    } catch (err) {
      // The worktree was never created, so onWorktreeAdded never fired to
      // consume the suppression above — clear it so a later, genuinely
      // external creation at this same path isn't silently swallowed.
      clearSuppressedNewWorktreeNotification(result.path);
      notifyError("Create worktree failed", err);
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: WorktreeRow) {
    if (busy || isWorktreeRemovePending(row.wt.path)) return;
    await confirmAndRemoveWorktree({
      ctx,
      store,
      worktreePath: row.wt.path,
      workspaceId,
      isOpen: row.isOpen,
      notifyError,
      onSuccess: onChanged,
    });
  }

  async function prune() {
    if (busy) return;
    setBusy(true);
    try {
      await store.pruneWorktrees();
      // Drop workspace folders that pointed at now-pruned directories.
      for (const row of rows) {
        if (row.wt.prunable != null && row.isOpen) {
          ctx.workspaces.removeFolder(workspaceId, row.wt.path);
        }
      }
      onChanged();
    } catch (err) {
      notifyError("Prune failed", err);
    } finally {
      setBusy(false);
    }
  }

  function rowBadges(row: WorktreeRow) {
    const badges: { label: string; tooltip?: string; warn?: boolean }[] = [];
    if (isWorktreeRemovePending(row.wt.path)) {
      badges.push({ label: "Removing…" });
      return badges;
    }
    if (row.isOrphan) {
      badges.push({
        label: "missing on disk",
        tooltip: "This folder is open in the workspace but no longer on disk.",
        warn: true,
      });
      return badges;
    }
    if (row.wt.isMain) badges.push({ label: "main" });
    if (row.isCurrent) badges.push({ label: "this view" });
    else if (row.isOpen) badges.push({ label: "open" });
    if (row.wt.locked != null) {
      badges.push({
        label: "locked",
        tooltip: row.wt.locked || undefined,
        warn: true,
      });
    }
    if (row.wt.prunable != null) {
      badges.push({ label: "stale", tooltip: row.wt.prunable, warn: true });
    }
    return badges;
  }

  function rowTrailing(row: WorktreeRow): ReactNode {
    const pending = isWorktreeRemovePending(row.wt.path);
    const acts = worktreeActions(row, pending);
    const parts: ReactNode[] = [];

    for (const b of rowBadges(row)) {
      const badge = <Badge tone={b.warn ? "warn" : "accent"}>{b.label}</Badge>;
      parts.push(
        b.tooltip ? (
          <Tooltip key={b.label} content={b.tooltip}>
            {badge}
          </Tooltip>
        ) : (
          <span key={b.label}>{badge}</span>
        ),
      );
    }

    if (acts.includes("prune")) {
      parts.push(
        <Tooltip key="prune" content="Prune stale worktrees">
          <IconButton
            size="sm"
            aria-label="Prune stale worktrees"
            onClick={() => void prune()}
          >
            <Broom size={14} />
          </IconButton>
        </Tooltip>,
      );
    }
    if (acts.includes("close") && row.isOrphan) {
      parts.push(
        <Tooltip
          key="close"
          content="Close worktree view (folder is missing on disk)"
        >
          <IconButton
            size="sm"
            aria-label={`Close worktree view ${path.basename(row.wt.path)}`}
            onClick={() => closeWorktreeView(row)}
          >
            <X size={14} />
          </IconButton>
        </Tooltip>,
      );
    }
    if (acts.includes("remove")) {
      parts.push(
        <Tooltip key="remove" content="Remove worktree">
          <IconButton
            size="sm"
            aria-label={`Remove worktree ${path.basename(row.wt.path)}`}
            onClick={() => void remove(row)}
          >
            <Trash size={14} />
          </IconButton>
        </Tooltip>,
      );
    }

    return parts.length > 0 ? <>{parts}</> : undefined;
  }

  return (
    <div className="git-branch-modal">
      <p className="git-wt-lead">
        Click a worktree to open it alongside your current folders; click an
        open one again to close its view.
      </p>

      <div className="git-branch-list-scroll silo-scroll">
        {worktrees === null ? (
          <EmptyState
            icon={<ArrowsClockwise size={22} className="git-branch-spin" />}
            title="Loading worktrees…"
          />
        ) : displayRows.length === 0 ? (
          <EmptyState title="No worktrees." />
        ) : (
          <>
            <List aria-label="Worktrees">
              {displayRows.map((row) => {
                const pending = isWorktreeRemovePending(row.wt.path);
                const dir = path.basename(row.wt.path);
                // Orphans keep status in the trailing badge — don't duplicate
                // "missing on disk" in the name line where it truncates away.
                const label = row.isOrphan
                  ? dir
                  : `${dir} · ${row.wt.branch ?? "(detached)"}`;
                return (
                  <ListRow
                    key={row.wt.path}
                    selected={row.isOpen && !row.isOrphan && !pending}
                    leading={
                      pending ? (
                        <ArrowsClockwise
                          size={15}
                          className="git-branch-spin"
                        />
                      ) : (
                        <FolderSimple size={15} />
                      )
                    }
                    trailing={rowTrailing(row)}
                    onSelect={() => toggleOpenAlongside(row)}
                  >
                    {label}
                  </ListRow>
                );
              })}
            </List>
            {isOnlyMainWorktree(displayRows) && (
              <p className="git-wt-empty-hint">
                No linked worktrees for this repo yet.
              </p>
            )}
          </>
        )}
      </div>

      <Callout>
        Opening a worktree adds it as another folder in this workspace — its
        files, terminals, and Git panel appear alongside your current ones,
        letting you work a second branch without switching. Closing a view
        leaves the worktree and its branch untouched on disk.
      </Callout>

      <ModalActions
        start={
          <Button
            variant="primary"
            onClick={() => void create()}
            disabled={busy}
          >
            <Plus size={14} weight="bold" /> Create worktree
          </Button>
        }
      >
        {anyPrunable && (
          <Button onClick={() => void prune()} disabled={busy}>
            <Broom size={15} /> Prune stale
          </Button>
        )}
      </ModalActions>
    </div>
  );
}

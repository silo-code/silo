import {
  useCallback,
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
import type { GitWorktree } from "../git/git-api";
import { getGitApi } from "./git-runtime";
import { confirmAndRemoveWorktree } from "./confirm-and-remove-worktree";
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
  orphanOpenFolders,
  worktreeActions,
  type WorktreeRow,
} from "./worktree-model";
import {
  WorktreeCreateDialog,
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
  const [worktrees, setWorktrees] = useState<GitWorktree[] | null>(null);
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

  const reload = useCallback(async () => {
    const api = getGitApi();
    if (!api) {
      notifyError("Worktrees", "Git provider (silo.git) unavailable.");
      return;
    }
    try {
      setWorktrees(await api.worktrees(folder));
    } catch (err) {
      notifyError("Listing worktrees failed", err);
    }
  }, [folder, notifyError]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Reload when a remove succeeds from any entry point (e.g. Git view ⋯ while
  // this modal stays open). Unsubscribe on unmount / reload identity change.
  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeWorktreeListDirty(() => {
      if (active) void reload();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [reload]);

  const rows = useMemo(
    () => buildWorktreeRows(worktrees ?? [], folder, wsFolder, allFolders),
    [worktrees, folder, wsFolder, allFolders],
  );
  // Folders still open in the workspace but gone from git's worktree list
  // (deleted/pruned on disk) — otherwise they'd be invisible in this modal
  // while still spawning Git panel sections and status errors.
  const displayRows = useMemo(
    () => [...rows, ...orphanOpenFolders(rows, allFolders, wsFolder, folder)],
    [rows, allFolders, wsFolder, folder],
  );
  const anyPrunable = displayRows.some((r) => r.wt.prunable != null);

  // The live provider, or a notify + null so handlers can bail gracefully.
  function api() {
    const a = getGitApi();
    if (!a) notifyError("Worktrees", "Git provider (silo.git) unavailable.");
    return a;
  }

  // Open alongside: the worktree becomes another workspace folder, so File
  // Explorer and the Git panel grow an extra root. The scope roots follow the
  // folder list, so files/terminals in the worktree work immediately.
  async function open(row: WorktreeRow) {
    if (busy || isWorktreeRemovePending(row.wt.path)) return;
    ctx.workspaces.addFolder(workspaceId, row.wt.path);
    ctx.ui.notify("info", `Opened ${path.basename(row.wt.path)} alongside`);
  }

  // Close the view only — the worktree itself is untouched.
  function closeView(row: WorktreeRow) {
    if (isWorktreeRemovePending(row.wt.path)) return;
    ctx.workspaces.removeFolder(workspaceId, row.wt.path);
  }

  // Clicking a row toggles its view: open it alongside if closed, close it if
  // open. The primary folder and stale (prune-only) rows toggle nothing.
  function toggleView(row: WorktreeRow) {
    const acts = worktreeActions(row, isWorktreeRemovePending(row.wt.path));
    if (acts.includes("open")) void open(row);
    else if (acts.includes("close")) closeView(row);
  }

  async function create() {
    const a = api();
    if (!a || busy) return;
    const used = branchesInUse(worktrees ?? []);
    let available: string[] = [];
    try {
      available = (await a.branches(folder))
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
    if (!result) return;
    setBusy(true);
    try {
      await a.addWorktree(
        folder,
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
      await reload();
      onChanged();
    } catch (err) {
      notifyError("Create worktree failed", err);
    } finally {
      setBusy(false);
    }
  }

  async function remove(row: WorktreeRow) {
    const a = api();
    if (!a || busy || isWorktreeRemovePending(row.wt.path)) return;
    await confirmAndRemoveWorktree({
      ctx,
      api: a,
      cwd: folder,
      worktreePath: row.wt.path,
      workspaceId,
      isOpen: row.isOpen,
      notifyError,
      onSuccess: () => {
        void reload();
        onChanged();
      },
    });
  }

  async function prune() {
    const a = api();
    if (!a || busy) return;
    setBusy(true);
    try {
      await a.pruneWorktrees(folder);
      // Drop workspace folders that pointed at now-pruned directories.
      for (const row of rows) {
        if (row.wt.prunable != null && row.isOpen) {
          ctx.workspaces.removeFolder(workspaceId, row.wt.path);
        }
      }
      await reload();
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
          content="Close this view (folder is missing on disk)"
        >
          <IconButton
            size="sm"
            aria-label={`Close view ${path.basename(row.wt.path)}`}
            onClick={() => closeView(row)}
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
                    onSelect={() => toggleView(row)}
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

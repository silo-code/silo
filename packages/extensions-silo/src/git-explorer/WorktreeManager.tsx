import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowsClockwise,
  Broom,
  FolderSimple,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import {
  Tooltip,
  path,
  useFocusGroup,
  useServiceState,
  type ExtensionContext,
  type MenuEntry,
} from "@silo-code/sdk";
import type { GitWorktree } from "../git/git-api";
import { getGitApi } from "./git-runtime";
import {
  branchesInUse,
  buildWorktreeRows,
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
 * panel grow an extra root), hover for close-view / remove, and create or
 * prune from the footer. The host owns the surrounding modal chrome.
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

  const rows = useMemo(
    () => buildWorktreeRows(worktrees ?? [], folder, wsFolder, allFolders),
    [worktrees, folder, wsFolder, allFolders],
  );
  const anyPrunable = rows.some((r) => r.wt.prunable != null);

  // Roving keyboard nav (same as the branch manager): one Tab stop, ↑/↓ move,
  // Enter opens the row alongside when that's an available action.
  const list = useFocusGroup({
    count: rows.length,
    orientation: "vertical",
    onActivate: (i) => {
      const row = rows[i];
      if (row) toggleView(row);
    },
    onMenu: (i, anchor) => {
      const row = rows[i];
      if (row) openRowMenu(row, { anchor });
    },
  });

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
    if (busy) return;
    ctx.workspaces.addFolder(workspaceId, row.wt.path);
    ctx.ui.notify("info", `Opened ${path.basename(row.wt.path)} alongside`);
  }

  // Close the view only — the worktree itself is untouched.
  function closeView(row: WorktreeRow) {
    ctx.workspaces.removeFolder(workspaceId, row.wt.path);
  }

  // Clicking a row toggles its view: open it alongside if closed, close it if
  // open. The primary folder and stale (prune-only) rows toggle nothing.
  function toggleView(row: WorktreeRow) {
    const acts = worktreeActions(row);
    if (acts.includes("open")) void open(row);
    else if (acts.includes("close")) closeView(row);
  }

  // Hover hint for a row, standing in for the removed open/close icons: what a
  // click will do, or the path for a row that can't be toggled.
  function toggleHint(row: WorktreeRow): string {
    const acts = worktreeActions(row);
    if (acts.includes("open")) return "Open alongside your current folders";
    if (acts.includes("close"))
      return "Close this view (the worktree stays on disk)";
    return row.wt.path;
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
    if (!a || busy) return;
    const name = path.basename(row.wt.path);
    const ok = await ctx.ui.confirm({
      title: `Remove worktree "${name}"?`,
      body: `Deletes the directory at ${row.wt.path}. The branch itself is kept.`,
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      try {
        await a.removeWorktree(folder, row.wt.path);
      } catch (err) {
        // Dirty worktree: git refuses without --force. Confirm the discard.
        if (
          !/contains modified or untracked files|use --force/i.test(String(err))
        ) {
          throw err;
        }
        const force = await ctx.ui.confirm({
          title: `"${name}" has uncommitted changes`,
          body: "Force-remove the worktree and discard them? This can't be undone.",
          confirmLabel: "Force Remove",
          danger: true,
        });
        if (!force) return;
        await a.removeWorktree(folder, row.wt.path, true);
      }
      if (row.isOpen) ctx.workspaces.removeFolder(workspaceId, row.wt.path);
      await reload();
      onChanged();
    } catch (err) {
      notifyError(`Remove "${name}" failed`, err);
    } finally {
      setBusy(false);
    }
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

  // The row context menu — the keyboard path to the row actions (ContextMenu
  // key / Shift+F10 via the focus group, or right-click), mirroring the hover
  // buttons.
  function rowMenuItems(row: WorktreeRow): MenuEntry[] {
    const acts = worktreeActions(row);
    const items: MenuEntry[] = [];
    if (acts.includes("open")) {
      items.push({ label: "Open alongside", run: () => void open(row) });
    }
    if (acts.includes("close")) {
      items.push({ label: "Close view", run: () => closeView(row) });
    }
    if (acts.includes("prune")) {
      items.push({ label: "Prune stale worktrees", run: () => void prune() });
    }
    if (acts.includes("remove")) {
      if (items.length > 0) items.push({ type: "separator" });
      items.push({
        label: "Remove worktree…",
        danger: true,
        run: () => void remove(row),
      });
    }
    return items;
  }

  function openRowMenu(
    row: WorktreeRow,
    placement: { at?: { x: number; y: number }; anchor?: HTMLElement | null },
  ) {
    const items = rowMenuItems(row);
    if (items.length === 0) return;
    void ctx.ui.showMenu({ items, toggle: false, ...placement });
  }

  function rowBadges(row: WorktreeRow) {
    const badges: { label: string; tooltip?: string; warn?: boolean }[] = [];
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

  return (
    <div className="git-branch-modal">
      <p className="git-wt-lead">
        Click a worktree to open it alongside your current folders; click an
        open one again to close its view.
      </p>
      <div className="git-branch-list" {...list.containerProps}>
        {worktrees === null && (
          <div className="git-branch-loader">
            <ArrowsClockwise size={22} className="git-branch-spin" />
            <span>Loading worktrees…</span>
          </div>
        )}
        {worktrees !== null && rows.length === 0 && (
          <div className="git-branch-empty">No worktrees.</div>
        )}
        {rows.map((row, i) => {
          const acts = worktreeActions(row);
          const toggleable = acts.includes("open") || acts.includes("close");
          return (
            <div
              key={row.wt.path}
              className={`git-branch-row git-wt-row${row.isOpen ? " git-wt-open" : ""}${toggleable ? "" : " git-wt-static"}`}
              role="button"
              onClick={() => toggleView(row)}
              onContextMenu={(e) => {
                e.preventDefault();
                if (e.button === 2) {
                  openRowMenu(row, { at: { x: e.clientX, y: e.clientY } });
                } else {
                  openRowMenu(row, { anchor: e.currentTarget });
                }
              }}
              {...list.getItemProps(i)}
            >
              <span className="git-branch-glyph">
                <FolderSimple size={15} />
              </span>
              <span className="git-wt-text">
                <span className="git-wt-title">
                  <Tooltip content={toggleHint(row)}>
                    <span className="git-wt-dir">
                      {path.basename(row.wt.path)}
                    </span>
                  </Tooltip>
                  {rowBadges(row).map((b) =>
                    b.tooltip ? (
                      <Tooltip key={b.label} content={b.tooltip}>
                        <span
                          className={`git-branch-badge${b.warn ? " git-wt-warn" : ""}`}
                        >
                          {b.label}
                        </span>
                      </Tooltip>
                    ) : (
                      <span
                        key={b.label}
                        className={`git-branch-badge${b.warn ? " git-wt-warn" : ""}`}
                      >
                        {b.label}
                      </span>
                    ),
                  )}
                </span>
                <span className="git-wt-branch">
                  {row.wt.branch ?? "(detached)"}
                </span>
              </span>
              <span
                className="git-branch-actions"
                onClick={(e) => e.stopPropagation()}
              >
                {acts.includes("prune") && (
                  <Tooltip content="Prune stale worktrees">
                    <button
                      type="button"
                      className="git-branch-action"
                      tabIndex={-1}
                      onClick={() => void prune()}
                    >
                      <Broom size={14} />
                    </button>
                  </Tooltip>
                )}
                {acts.includes("remove") && (
                  <Tooltip content="Remove worktree">
                    <button
                      type="button"
                      className="git-branch-action danger"
                      tabIndex={-1}
                      onClick={() => void remove(row)}
                    >
                      <Trash size={14} />
                    </button>
                  </Tooltip>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <p className="git-wt-note">
        Opening a worktree adds it as another folder in this workspace — its
        files, terminals, and Git panel appear alongside your current ones,
        letting you work a second branch without switching. Closing a view
        leaves the worktree and its branch untouched on disk.
      </p>

      <div className="git-branch-footer">
        <button
          type="button"
          className="silo-button-primary"
          onClick={() => void create()}
          disabled={busy}
        >
          <Plus size={14} weight="bold" /> Create worktree
        </button>
        {anyPrunable && (
          <button
            type="button"
            className="silo-button"
            onClick={() => void prune()}
            disabled={busy}
          >
            <Broom size={15} /> Prune stale
          </button>
        )}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowsClockwise,
  Cloud,
  CloudArrowUp,
  GitBranch as GitBranchIcon,
  PencilSimple,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import {
  useFocusGroup,
  type ExtensionContext,
  type MenuEntry,
} from "@silo-code/sdk";
import type { GitBranch, GitLogEntry } from "../git/git-api";
import { getGitApi } from "./git-runtime";
import {
  branchActions,
  filterBranches,
  isPublished,
  localNameFor,
  orderBranches,
  remoteBranchNames,
} from "./branch-model";
import { ForceDeleteDialog } from "./ForceDeleteDialog";
import { BranchNameDialog } from "./BranchNameDialog";
import { ICON_PUSH } from "./git-icons";

export interface BranchManagerProps {
  ctx: ExtensionContext;
  /** The repo working directory whose branches are managed. */
  folder: string;
  /** Close the host modal. */
  close: () => void;
  /** Called after a switch/create so the panel re-reads status. */
  onSwitched: () => void;
  /** Surface a git failure as a toast (reuses the view's helper). */
  notifyError: (title: string, err: unknown) => void;
}

/**
 * Content of the branch manager modal (`ctx.ui.showModal`). A searchable list of
 * local + remote branches with inline actions: click a row to switch (or check
 * out a remote as a new local tracking branch), hover a local branch for rename
 * / delete, and create a new branch from the input at the top. The host owns the
 * surrounding modal chrome.
 */
export function BranchManager({
  ctx,
  folder,
  close,
  onSwitched,
  notifyError,
}: BranchManagerProps) {
  const [branches, setBranches] = useState<GitBranch[] | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [pushing, setPushing] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const reload = useCallback(async () => {
    const api = getGitApi();
    if (!api) {
      notifyError("Branches", "Git provider (silo.git) unavailable.");
      return;
    }
    try {
      setBranches(await api.branches(folder));
    } catch (err) {
      notifyError("Listing branches failed", err);
    }
  }, [folder, notifyError]);

  useEffect(() => {
    void reload();
    searchRef.current?.focus();
  }, [reload]);

  const visible = useMemo(
    () => orderBranches(filterBranches(branches ?? [], query)),
    [branches, query],
  );
  // Remote-tracking refs that actually exist — used to tell a published branch
  // (plain push) from one whose upstream is gone/never-pushed (publish).
  const remoteNames = useMemo(
    () => remoteBranchNames(branches ?? []),
    [branches],
  );

  // Roving keyboard nav over the list (same as the side panels): the list is a
  // single Tab stop, ↑/↓/Home/End move between rows, and Enter switches. Entry
  // parks on the current branch. ArrowDown from the filter box drops into it.
  const currentIndex = visible.findIndex((b) => b.current);
  const list = useFocusGroup({
    count: visible.length,
    start: currentIndex >= 0 ? currentIndex : 0,
    orientation: "vertical",
    onActivate: (i) => {
      const b = visible[i];
      if (b) void switchTo(b);
    },
    // ContextMenu key / Shift+F10 → the row's action menu, anchored to the row.
    onMenu: (i, anchor) => {
      const b = visible[i];
      if (b) openBranchMenu(b, { anchor });
    },
  });

  // The live provider, or a notify + null so handlers can bail gracefully.
  function api() {
    const a = getGitApi();
    if (!a) notifyError("Branches", "Git provider (silo.git) unavailable.");
    return a;
  }

  // Push a local branch. With no upstream this is a first push that publishes
  // the branch and sets tracking (`-u`); otherwise it pushes to its upstream's
  // remote (defaulting to origin).
  async function pushBranch(b: GitBranch) {
    const a = api();
    if (!a || pushing) return;
    setPushing(b.name);
    try {
      const published = isPublished(b, remoteNames);
      const remote = b.upstream ? b.upstream.split("/")[0] : "origin";
      await a.push(folder, {
        branch: b.name,
        remote,
        // Re-establish tracking when the branch isn't actually published (never
        // pushed, or its remote branch was deleted) so it republishes cleanly.
        setUpstream: !published,
      });
      ctx.ui.notify("info", `Pushed ${b.name}`);
      await reload();
    } catch (err) {
      notifyError(`Push "${b.name}" failed`, err);
    } finally {
      setPushing(null);
    }
  }

  // Fetch + prune: reconciles the list with the remote, dropping stale
  // remote-tracking branches (deleted upstream) that would otherwise linger.
  async function runFetch() {
    const a = api();
    if (!a || fetching) return;
    setFetching(true);
    try {
      await a.fetch(folder, true);
      await reload();
    } catch (err) {
      notifyError("Fetch failed", err);
    } finally {
      setFetching(false);
    }
  }

  // Prompt for a branch name via a custom dialog (no autocapitalize/autocorrect,
  // unlike ctx.ui.prompt). Resolves the trimmed name, or undefined if cancelled.
  function promptName(opts: {
    title: string;
    label?: string;
    initialValue?: string;
    placeholder?: string;
    confirmLabel: string;
  }) {
    return ctx.ui.showModal<string>(
      (close) => (
        <BranchNameDialog
          label={opts.label}
          initialValue={opts.initialValue}
          placeholder={opts.placeholder}
          confirmLabel={opts.confirmLabel}
          close={close}
        />
      ),
      { title: opts.title, dismissible: true, size: "sm" },
    );
  }

  async function create() {
    const name = await promptName({
      title: "Create branch",
      label: "New branch name",
      placeholder: "feature/my-branch",
      confirmLabel: "Create",
    });
    const a = api();
    if (!name || !a || busy) return;
    setBusy(true);
    try {
      await a.createBranch(folder, name);
      onSwitched();
      close();
    } catch (err) {
      notifyError(`Create "${name}" failed`, err);
      setBusy(false);
    }
  }

  async function switchTo(b: GitBranch) {
    const a = api();
    if (b.current || !a || busy) return;
    setBusy(true);
    try {
      if (b.remote) await a.createBranch(folder, localNameFor(b.name), b.name);
      else await a.switchBranch(folder, b.name);
      onSwitched();
      close();
    } catch (err) {
      notifyError(`Switch to "${b.name}" failed`, err);
      setBusy(false);
    }
  }

  async function rename(b: GitBranch) {
    const next = await promptName({
      title: "Rename branch",
      label: `New name for "${b.name}"`,
      initialValue: b.name,
      confirmLabel: "Rename",
    });
    const a = api();
    if (!next || !a) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === b.name) return;
    try {
      await a.renameBranch(folder, b.name, trimmed);
      if (b.current) onSwitched();
      await reload();
    } catch (err) {
      notifyError(`Rename "${b.name}" failed`, err);
    }
  }

  // The force-delete modal — lists the commits at risk (a plain confirm body
  // would crunch them onto one line). Resolves true if the user confirms.
  function confirmForceDelete(b: GitBranch, commits: GitLogEntry[]) {
    return ctx.ui
      .showModal<boolean>(
        (close) => (
          <ForceDeleteDialog
            branchName={b.name}
            upstream={b.upstream}
            commits={commits}
            close={close}
          />
        ),
        { title: `Force-delete "${b.name}"?`, dismissible: true, size: "lg" },
      )
      .then((r) => r === true);
  }

  async function del(b: GitBranch) {
    const a = api();
    if (!a) return;

    // Detect up front whether the branch is fully merged. If not, the same
    // commits `git branch -d` would refuse to discard become a preview in a
    // single force-delete confirmation — no second dialog. Merged → a simple
    // confirm.
    let unmerged: GitLogEntry[] = [];
    try {
      unmerged = await a.unmergedCommits(folder, b.name, b.upstream);
    } catch {
      // Couldn't compute the range — fall back to a plain delete; the safety
      // net below still catches git's own `-d` refusal.
    }
    const force = unmerged.length > 0;
    const confirmed = force
      ? await confirmForceDelete(b, unmerged)
      : await ctx.ui.confirm({
          title: `Delete branch "${b.name}"?`,
          confirmLabel: "Delete",
          danger: true,
        });
    if (!confirmed) return;

    try {
      await a.deleteBranch(folder, b.name, force);
      await reload();
    } catch (err) {
      // Safety net: if a plain `-d` still trips git's "not fully merged" guard
      // (a merge-rule edge our check missed), offer the force-delete modal
      // rather than surfacing the raw error.
      if (!force && /not fully merged/i.test(String(err))) {
        let commits: GitLogEntry[] = [];
        try {
          commits = await a.unmergedCommits(folder, b.name, b.upstream);
        } catch {
          // The dialog handles an empty list.
        }
        if (!(await confirmForceDelete(b, commits))) return;
        try {
          await a.deleteBranch(folder, b.name, true);
          await reload();
        } catch (forceErr) {
          notifyError(`Delete "${b.name}" failed`, forceErr);
        }
        return;
      }
      notifyError(`Delete "${b.name}" failed`, err);
    }
  }

  // The row context menu — the keyboard path to the row actions (ContextMenu
  // key / Shift+F10 via the focus group, or right-click), mirroring the hover
  // buttons so keyboard users aren't locked out of push/rename/delete.
  function branchMenuItems(b: GitBranch): MenuEntry[] {
    const acts = branchActions(b, isPublished(b, remoteNames));
    const items: MenuEntry[] = [];
    if (acts.includes("switch")) {
      items.push({
        label: b.remote ? "Check out as local branch" : "Switch to branch",
        run: () => void switchTo(b),
      });
    }
    if (acts.includes("push")) {
      items.push({ label: "Push", run: () => void pushBranch(b) });
    }
    if (acts.includes("publish")) {
      items.push({ label: "Publish", run: () => void pushBranch(b) });
    }
    if (acts.includes("rename") || acts.includes("delete")) {
      items.push({ type: "separator" });
      if (acts.includes("rename")) {
        items.push({ label: "Rename…", run: () => void rename(b) });
      }
      if (acts.includes("delete")) {
        items.push({ label: "Delete", danger: true, run: () => void del(b) });
      }
    }
    return items;
  }

  // Open a row's menu — at the cursor for a right-click, anchored to the row for
  // a keyboard invocation (`toggle: false` so a stray duplicate event re-opens).
  function openBranchMenu(
    b: GitBranch,
    placement: { at?: { x: number; y: number }; anchor?: HTMLElement | null },
  ) {
    const items = branchMenuItems(b);
    if (items.length === 0) return;
    void ctx.ui.showMenu({ items, toggle: false, ...placement });
  }

  return (
    <div className="git-branch-modal">
      <input
        ref={searchRef}
        className="git-branch-search"
        placeholder="Filter branches…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            list.focusItem(currentIndex >= 0 ? currentIndex : 0);
          }
        }}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
      />

      <div className="git-branch-list" {...list.containerProps}>
        {branches === null && (
          <div className="git-branch-loader">
            <ArrowsClockwise size={22} className="git-branch-spin" />
            <span>Loading branches…</span>
          </div>
        )}
        {branches !== null && visible.length === 0 && (
          <div className="git-branch-empty">No matching branches.</div>
        )}
        {(branches ?? []).length > 0 &&
          visible.map((b, i) => (
            <div
              key={(b.remote ? "r:" : "l:") + b.name}
              className={`git-branch-row${b.current ? " current" : ""}`}
              role="button"
              title={b.current ? "Current branch" : `Switch to ${b.name}`}
              onClick={() => void switchTo(b)}
              onContextMenu={(e) => {
                e.preventDefault();
                // Right-click opens at the cursor; a keyboard-invoked
                // contextmenu (button !== 2) anchors to the row instead.
                if (e.button === 2) {
                  openBranchMenu(b, { at: { x: e.clientX, y: e.clientY } });
                } else {
                  openBranchMenu(b, { anchor: e.currentTarget });
                }
              }}
              {...list.getItemProps(i)}
            >
              <span className="git-branch-glyph">
                {b.remote ? <Cloud size={15} /> : <GitBranchIcon size={15} />}
              </span>
              <span className="git-branch-name">{b.name}</span>
              {b.current && <span className="git-branch-badge">current</span>}
              {!b.remote && (
                <span
                  className="git-branch-actions"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    className={`git-branch-action${pushing === b.name ? " working" : ""}`}
                    title={
                      isPublished(b, remoteNames)
                        ? `Push ${b.name}`
                        : `Publish ${b.name}`
                    }
                    tabIndex={-1}
                    disabled={pushing === b.name}
                    onClick={() => void pushBranch(b)}
                  >
                    {isPublished(b, remoteNames) ? (
                      ICON_PUSH
                    ) : (
                      <CloudArrowUp size={16} />
                    )}
                  </button>
                  {!b.current && (
                    <>
                      <button
                        type="button"
                        className="git-branch-action"
                        title="Rename branch"
                        tabIndex={-1}
                        onClick={() => void rename(b)}
                      >
                        <PencilSimple size={14} />
                      </button>
                      <button
                        type="button"
                        className="git-branch-action danger"
                        title="Delete branch"
                        tabIndex={-1}
                        onClick={() => void del(b)}
                      >
                        <Trash size={14} />
                      </button>
                    </>
                  )}
                </span>
              )}
            </div>
          ))}
      </div>

      <div className="git-branch-footer">
        <button
          type="button"
          className="silo-button-primary"
          onClick={() => void create()}
          disabled={busy}
        >
          <Plus size={14} weight="bold" /> Create branch
        </button>
        <button
          type="button"
          className="silo-button"
          onClick={() => void runFetch()}
          disabled={fetching}
        >
          <ArrowsClockwise
            size={15}
            className={fetching ? "git-branch-spin" : undefined}
          />{" "}
          Fetch
        </button>
      </div>
    </div>
  );
}

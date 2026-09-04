import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type ReactNode,
} from "react";
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
  Badge,
  Button,
  EmptyState,
  IconButton,
  List,
  ListRow,
  ModalActions,
  SearchInput,
  Tooltip,
  type ExtensionContext,
} from "@silo-code/sdk";
import type { GitAPI, GitBranch, GitLogEntry } from "@silo-code/git-api";
import { NULL_GIT_REPO_STORE } from "@silo-code/git-api";
import {
  filterBranches,
  isPublished,
  localNameFor,
  orderBranches,
  remoteBranchNames,
} from "./branch-model";
import { ForceDeleteDialog } from "./ForceDeleteDialog";
import { BranchNameDialog } from "./BranchNameDialog";
import { ICON_PUSH } from "./git-icons";
import type { FolderSelection } from "./folder-selection";

export interface BranchManagerProps {
  ctx: ExtensionContext;
  /**
   * Which repo working directory's branches are managed — shared with the
   * modal title's folder switcher, see folder-selection.ts.
   */
  selection: FolderSelection;
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
 * out a remote as a new local tracking branch), trailing IconButtons for push /
 * rename / delete, and create / fetch in the footer. The host owns the
 * surrounding modal chrome.
 */
export function BranchManager({
  ctx,
  selection,
  close,
  onSwitched,
  notifyError,
}: BranchManagerProps) {
  // Shared with the modal title's folder switcher — see folder-selection.ts.
  const folder = useSyncExternalStore(
    selection.subscribe,
    selection.get,
    selection.get,
  );
  const [branches, setBranches] = useState<GitBranch[] | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [pushing, setPushing] = useState<string | null>(null);
  const [switching, setSwitching] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Picking a different folder starts over: an old query could otherwise
  // hide every branch in the newly-selected repo.
  useEffect(() => {
    setQuery("");
  }, [folder]);

  // ↓ from the search box hands off to the list's own roving-tabindex item
  // (List/useFocusGroup then own ↑/↓ + Enter from there).
  function handleSearchKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown") return;
    const item = listRef.current?.querySelector<HTMLElement>(
      '[data-focus-item][tabindex="0"]',
    );
    if (!item) return;
    e.preventDefault();
    item.focus();
  }

  // ADR 0037. Branches aren't part of the store's live snapshot (they only
  // change via the mutators below, all of which live here) — reload() stays
  // a manual, explicit fetch through the one-shot `.api` escape hatch.
  const gitApi = ctx.getExtension<GitAPI>("silo.git")?.api;
  const store = gitApi?.watchRepo(folder) ?? NULL_GIT_REPO_STORE;

  const reload = useCallback(async () => {
    try {
      setBranches(await store.api.branches(folder));
    } catch (err) {
      notifyError("Listing branches failed", err);
    }
  }, [store, folder, notifyError]);

  useEffect(() => {
    void reload();
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

  // Push a local branch. With no upstream this is a first push that publishes
  // the branch and sets tracking (`-u`); otherwise it pushes to its upstream's
  // remote (defaulting to origin).
  async function pushBranch(b: GitBranch) {
    if (pushing) return;
    setPushing(b.name);
    try {
      const published = isPublished(b, remoteNames);
      const remote = b.upstream ? b.upstream.split("/")[0] : "origin";
      await store.push({
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
    if (fetching) return;
    setFetching(true);
    try {
      await store.fetch(true);
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
    if (!name || busy) return;
    setBusy(true);
    try {
      await store.createBranch(name);
      onSwitched();
      close();
    } catch (err) {
      notifyError(`Create "${name}" failed`, err);
      setBusy(false);
    }
  }

  async function switchTo(b: GitBranch) {
    if (b.current || busy) return;
    setBusy(true);
    setSwitching(b.name);
    try {
      // Paint the row as selected before switching: local checkouts resolve
      // fast enough that closing right away reads as "nothing happened".
      await new Promise((r) => setTimeout(r, 150));
      if (b.remote) await store.createBranch(localNameFor(b.name), b.name);
      else await store.switchBranch(b.name);
      onSwitched();
      close();
    } catch (err) {
      notifyError(`Switch to "${b.name}" failed`, err);
      setBusy(false);
      setSwitching(null);
    }
  }

  async function rename(b: GitBranch) {
    const next = await promptName({
      title: "Rename branch",
      label: `New name for "${b.name}"`,
      initialValue: b.name,
      confirmLabel: "Rename",
    });
    if (!next) return;
    const trimmed = next.trim();
    if (!trimmed || trimmed === b.name) return;
    try {
      await store.renameBranch(b.name, trimmed);
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
        { title: `Force-delete "${b.name}"?`, dismissible: true, size: "md" },
      )
      .then((r) => r === true);
  }

  async function del(b: GitBranch) {
    // Detect up front whether the branch is fully merged. If not, the same
    // commits `git branch -d` would refuse to discard become a preview in a
    // single force-delete confirmation — no second dialog. Merged → a simple
    // confirm.
    let unmerged: GitLogEntry[] = [];
    try {
      unmerged = await store.api.unmergedCommits(folder, b.name, b.upstream);
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
      await store.deleteBranch(b.name, force);
      await reload();
    } catch (err) {
      // Safety net: if a plain `-d` still trips git's "not fully merged" guard
      // (a merge-rule edge our check missed), offer the force-delete modal
      // rather than surfacing the raw error.
      if (!force && /not fully merged/i.test(String(err))) {
        let commits: GitLogEntry[] = [];
        try {
          commits = await store.api.unmergedCommits(folder, b.name, b.upstream);
        } catch {
          // The dialog handles an empty list.
        }
        if (!(await confirmForceDelete(b, commits))) return;
        try {
          await store.deleteBranch(b.name, true);
          await reload();
        } catch (forceErr) {
          notifyError(`Delete "${b.name}" failed`, forceErr);
        }
        return;
      }
      notifyError(`Delete "${b.name}" failed`, err);
    }
  }

  function rowTrailing(b: GitBranch) {
    if (switching === b.name) {
      return <ArrowsClockwise size={14} className="git-branch-spin" />;
    }
    const parts: ReactNode[] = [];
    if (b.current) {
      parts.push(
        <Badge key="current" tone="accent">
          current
        </Badge>,
      );
    }
    if (!b.remote) {
      const published = isPublished(b, remoteNames);
      parts.push(
        <Tooltip
          key="push"
          content={published ? `Push ${b.name}` : `Publish ${b.name}`}
        >
          <IconButton
            size="sm"
            tabIndex={-1}
            aria-label={published ? `Push ${b.name}` : `Publish ${b.name}`}
            disabled={pushing === b.name}
            onClick={() => void pushBranch(b)}
          >
            {pushing === b.name ? (
              <ArrowsClockwise size={14} className="git-branch-spin" />
            ) : published ? (
              ICON_PUSH
            ) : (
              <CloudArrowUp size={16} />
            )}
          </IconButton>
        </Tooltip>,
      );
      if (!b.current) {
        parts.push(
          <Tooltip key="rename" content="Rename branch">
            <IconButton
              size="sm"
              tabIndex={-1}
              aria-label={`Rename ${b.name}`}
              onClick={() => void rename(b)}
            >
              <PencilSimple size={14} />
            </IconButton>
          </Tooltip>,
          <Tooltip key="delete" content="Delete branch">
            <IconButton
              size="sm"
              tabIndex={-1}
              aria-label={`Delete ${b.name}`}
              onClick={() => void del(b)}
            >
              <Trash size={14} />
            </IconButton>
          </Tooltip>,
        );
      }
    }
    return parts.length > 0 ? <>{parts}</> : undefined;
  }

  return (
    <div className="git-branch-modal">
      <div onKeyDown={handleSearchKeyDown}>
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder="Filter branches…"
          autoFocus
        />
      </div>

      <div ref={listRef} className="git-branch-list-scroll silo-scroll">
        {branches === null ? (
          <EmptyState
            icon={<ArrowsClockwise size={22} className="git-branch-spin" />}
            title="Loading branches…"
          />
        ) : visible.length === 0 ? (
          <EmptyState title="No matching branches." />
        ) : (
          <List aria-label="Branches">
            {visible.map((b) => (
              <ListRow
                key={(b.remote ? "r:" : "l:") + b.name}
                selected={switching ? switching === b.name : b.current}
                leading={
                  b.remote ? <Cloud size={15} /> : <GitBranchIcon size={15} />
                }
                trailing={rowTrailing(b)}
                onSelect={() => void switchTo(b)}
              >
                {b.name}
              </ListRow>
            ))}
          </List>
        )}
      </div>

      <ModalActions
        start={
          <Button
            variant="primary"
            onClick={() => void create()}
            disabled={busy}
          >
            <Plus size={14} weight="bold" /> Create branch
          </Button>
        }
      >
        <Button onClick={() => void runFetch()} disabled={fetching}>
          <ArrowsClockwise
            size={15}
            className={fetching ? "git-branch-spin" : undefined}
          />{" "}
          Fetch
        </Button>
      </ModalActions>
    </div>
  );
}

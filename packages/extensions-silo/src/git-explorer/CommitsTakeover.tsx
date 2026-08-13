import { type ReactNode, useEffect, useState } from "react";
import {
  CaretLeft,
  SortAscending,
  SortDescending,
} from "@phosphor-icons/react";
import { Tooltip, type ExtensionContext } from "@silo-code/sdk";
import type { GitStatus } from "../git/git-api";
import { CommitListView } from "./CommitListView";
import { CommitDetailView } from "./CommitDetailView";
import type { CommitOrder } from "./commit-list-model";
import { detailPaneSlot, listPaneSlot } from "./takeover-model";
import type { useViewStack } from "./use-view-stack";

/** Full-panel "View Commits" takeover for one repo — see GitExplorerPanel for
 * how `isActive` is decided (only one repo's takeover can cover the panel at
 * a time). Always mounted by `GitView` (off-screen via CSS when inactive) so
 * `isActive` toggling is a plain class change the browser can transition,
 * rather than a mount that has no "before" frame to animate from.
 *
 * The list/detail panes are likewise both always rendered once opened once —
 * see `contentMounted` below — so popping back to root (which starts the
 * exit slide) doesn't blank the content mid-animation, and reopening the same
 * repo resumes instantly instead of re-fetching. */
export function CommitsTakeover({
  ctx,
  folder,
  workspaceId,
  status,
  viewStack,
  isActive,
  branchLabel,
  worktreePill,
}: {
  ctx: ExtensionContext;
  folder: string;
  workspaceId: string;
  status: GitStatus | null;
  viewStack: ReturnType<typeof useViewStack>;
  isActive: boolean;
  branchLabel: string;
  worktreePill: ReactNode;
}) {
  const [commitOrder, setCommitOrder] = useState<CommitOrder>("oldestFirst");
  // Exact total for the tools-row count — reported by CommitListView once it
  // resolves (see GitAPI.commitCount), independent of how many rows are paged in.
  const [commitsTotal, setCommitsTotal] = useState<number | null>(null);
  // The detail pane needs a hash to render even while it's parked off-screen
  // (e.g. sliding out after Back) — keep the last one shown so it doesn't
  // blank mid-animation.
  const [lastDetailHash, setLastDetailHash] = useState<string | null>(
    viewStack.view.kind === "commit-detail" ? viewStack.view.hash : null,
  );

  // Lazily mount the list/detail panes on first open, then leave them mounted
  // — see the file doc comment for why (smooth exit animation + instant resume).
  const [contentMounted, setContentMounted] = useState(
    viewStack.view.kind !== "root",
  );
  useEffect(() => {
    if (viewStack.view.kind !== "root") setContentMounted(true);
    if (viewStack.view.kind === "commit-detail") {
      setLastDetailHash(viewStack.view.hash);
    }
  }, [viewStack.view]);

  if (!contentMounted) {
    return (
      <div
        className={`git-takeover${isActive ? " git-takeover--active" : ""}`}
      />
    );
  }

  const detailHash =
    viewStack.view.kind === "commit-detail"
      ? viewStack.view.hash
      : lastDetailHash;

  return (
    <div
      className={`git-takeover${isActive ? " git-takeover--active" : ""}`}
      onKeyDown={(e) => {
        if (e.key === "Escape" && viewStack.canPop) {
          e.preventDefault();
          viewStack.pop();
        }
      }}
    >
      <div className="git-takeover-header">
        <div className="git-takeover-toolbar">
          <button className="git-takeover-back" onClick={viewStack.pop}>
            <CaretLeft size={14} weight="bold" />
            Back
          </button>
          {viewStack.view.kind === "commits" && (
            <div className="git-takeover-tools">
              {commitsTotal !== null && (
                <span className="git-takeover-count">{commitsTotal}</span>
              )}
              <Tooltip
                content={
                  commitOrder === "oldestFirst"
                    ? "Showing oldest first — click for newest first"
                    : "Showing newest first — click for oldest first"
                }
              >
                <button
                  className="row-action"
                  onClick={() =>
                    setCommitOrder((o) =>
                      o === "oldestFirst" ? "newestFirst" : "oldestFirst",
                    )
                  }
                >
                  {commitOrder === "oldestFirst" ? (
                    <SortAscending size={14} />
                  ) : (
                    <SortDescending size={14} />
                  )}
                </button>
              </Tooltip>
            </div>
          )}
        </div>
        <div className="git-takeover-title-row">
          <span className="git-takeover-branch">{branchLabel}</span>
          {worktreePill}
        </div>
      </div>
      <div className="git-takeover-body">
        <div
          className={`git-takeover-pane git-takeover-pane--${listPaneSlot(viewStack.view)}`}
        >
          {status ? (
            <CommitListView
              ctx={ctx}
              folder={folder}
              status={status}
              order={commitOrder}
              onTotalCountChange={setCommitsTotal}
              onSelectCommit={(hash) =>
                viewStack.push({ kind: "commit-detail", hash })
              }
            />
          ) : (
            <div className="placeholder">Loading…</div>
          )}
        </div>
        <div
          className={`git-takeover-pane git-takeover-pane--${detailPaneSlot(viewStack.view)}`}
        >
          {detailHash && (
            <CommitDetailView
              ctx={ctx}
              folder={folder}
              workspaceId={workspaceId}
              hash={detailHash}
            />
          )}
        </div>
      </div>
    </div>
  );
}

import {
  ArrowsClockwise,
  CloudArrowUp,
  DotsThreeVertical,
  TreeStructure,
} from "@phosphor-icons/react";
import { Tooltip } from "@silo-code/sdk";
import type { GitStatus } from "@silo-code/git-api";

/**
 * Sync (pull-then-push, showing ↑ahead/↓behind) when the branch has an
 * upstream; Publish when it has a branch but no upstream yet; nothing for a
 * detached HEAD or an unknown status. Identical logic in both of GitView's
 * header layouts (the multi-root "root label" bar and the plain branch bar) —
 * extracted here instead of duplicated.
 */
export function GitSyncOrPublishButton({
  status,
  syncing,
  pushing,
  onSync,
  onPublish,
}: {
  status: GitStatus | null;
  syncing: boolean;
  pushing: boolean;
  onSync: () => void;
  onPublish: () => void;
}) {
  if (status?.upstream) {
    return (
      <Tooltip content="Sync (pull, then push)">
        <button
          className={`branch-tracking branch-sync${syncing ? " working" : ""}`}
          onClick={syncing ? undefined : onSync}
        >
          {syncing && <ArrowsClockwise className="git-branch-spin" size={12} />}
          ↑{status.ahead} ↓{status.behind}
        </button>
      </Tooltip>
    );
  }
  if (status?.inRepo && status.branch) {
    return (
      <Tooltip content="Publish branch">
        <button
          className={`branch-action branch-publish push-btn${pushing ? " working" : ""}`}
          onClick={pushing ? undefined : onPublish}
        >
          <CloudArrowUp size={16} />
        </button>
      </Tooltip>
    );
  }
  return null;
}

/**
 * Refresh + (optional) Manage worktrees + (optional) "⋯" menu — the trailing
 * button cluster in both of GitView's header layouts. `size` matches each
 * layout's own icon scale (the compact root-label bar runs smaller than the
 * plain branch bar); the "⋯" menu stays 18 in both, so it isn't
 * parameterized. `showMenu` exists because the plain branch bar hides the
 * menu while status is still loading, but always shows refresh — the
 * root-label bar's whole actions cluster is already gated on a loaded status
 * one level up, so it always passes `true`.
 */
export function GitHeaderActions({
  size,
  busy,
  onRefresh,
  showWorktreeButton,
  worktreeTooltip,
  onOpenWorktreeManager,
  showMenu,
  onOpenMenu,
}: {
  size: number;
  busy: boolean;
  onRefresh: () => void;
  showWorktreeButton: boolean;
  worktreeTooltip: string;
  onOpenWorktreeManager: () => void;
  showMenu: boolean;
  onOpenMenu: (anchor: HTMLElement) => void;
}) {
  return (
    <>
      <Tooltip content="Refresh">
        <button
          className={`branch-action refresh-btn${busy ? " working" : ""}`}
          onClick={busy ? undefined : onRefresh}
        >
          <ArrowsClockwise size={size} />
        </button>
      </Tooltip>
      {showWorktreeButton && (
        <Tooltip content={worktreeTooltip}>
          <button
            className="branch-action git-wt-btn"
            onClick={onOpenWorktreeManager}
            aria-label={worktreeTooltip}
          >
            <TreeStructure size={size} />
          </button>
        </Tooltip>
      )}
      {showMenu && (
        <Tooltip content="More actions">
          <button
            className="branch-action git-menu-btn"
            onClick={(e) => onOpenMenu(e.currentTarget)}
          >
            <DotsThreeVertical size={18} weight="bold" />
          </button>
        </Tooltip>
      )}
    </>
  );
}

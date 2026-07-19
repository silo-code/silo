import { Button, ModalActions } from "@silo-code/sdk";
import type { GitLogEntry } from "../git/git-api";

export interface ForceDeleteDialogProps {
  branchName: string;
  /** Where the commits are missing from — the branch's upstream, or HEAD. */
  upstream: string | null | undefined;
  /** The unmerged commits that a force-delete would discard (most recent first). */
  commits: GitLogEntry[];
  /** Settle the host modal: `true` to force-delete, `false`/dismiss to cancel. */
  close: (confirmed?: boolean) => void;
}

/**
 * Content of the force-delete confirmation (`ctx.ui.showModal`). Unlike
 * `ctx.ui.confirm` (a single plain-text line), this lays the unmerged commits
 * out as a scrollable list so the work at risk is legible. The host owns the
 * surrounding modal chrome and title.
 */
export function ForceDeleteDialog({
  branchName,
  upstream,
  commits,
  close,
}: ForceDeleteDialogProps) {
  const one = commits.length === 1;
  const target = upstream ? `"${upstream}"` : "the current branch";
  return (
    <div className="git-force-delete">
      {commits.length === 0 ? (
        <p className="git-force-delete-lead">
          <strong>{branchName}</strong> isn&apos;t fully merged and may have
          commits that aren&apos;t reachable from any other branch.
          Force-deleting it could <strong>permanently discard</strong> that
          work.
        </p>
      ) : (
        <>
          <p className="git-force-delete-lead">
            {one ? "1 commit" : `${commits.length} commits`} on{" "}
            <strong>{branchName}</strong> {one ? "isn't" : "aren't"} merged into{" "}
            {target} and will be <strong>permanently lost</strong>:
          </p>
          <ul className="git-force-delete-list silo-scroll">
            {commits.map((c) => (
              <li key={c.hash} className="git-force-delete-commit">
                <code className="git-force-delete-hash">{c.shortHash}</code>
                <span className="git-force-delete-subject" title={c.subject}>
                  {c.subject}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <ModalActions>
        <Button type="button" onClick={() => close(false)}>
          Cancel
        </Button>
        <Button type="button" variant="danger" onClick={() => close(true)}>
          Force delete
        </Button>
      </ModalActions>
    </div>
  );
}

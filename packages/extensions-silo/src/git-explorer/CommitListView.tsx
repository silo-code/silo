import { useEffect, useState } from "react";
import { Check, CopySimple } from "@phosphor-icons/react";
import { Tooltip } from "@silo-code/sdk";
import type { GitLogEntry, GitStatus } from "../git/git-api";
import { getGitApi } from "./git-runtime";
import {
  dividerIndex,
  displayDividerIndex,
  orderedCommits,
  type CommitOrder,
  type UnpushedSet,
} from "./commit-list-model";

const PAGE_SIZE = 50;

/** List page of the "View Commits" flow: current-branch history, with a
 * divider marking the boundary between unpushed and pushed commits. Display
 * `order` is controlled by the parent (its toggle button lives in `GitView`'s
 * shared subview header, next to Back/title). Reads `status` live from the
 * parent (not a snapshot taken when the view opened), so a branch switch
 * underfoot just re-fetches in place. */
export function CommitListView({
  folder,
  status,
  order,
  onSelectCommit,
}: {
  folder: string;
  status: GitStatus;
  order: CommitOrder;
  onSelectCommit: (hash: string) => void;
}) {
  const [commits, setCommits] = useState<GitLogEntry[]>([]);
  const [unpushed, setUnpushed] = useState<UnpushedSet>(null);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  // Reset pagination when the underlying branch changes so "Load more" starts
  // fresh rather than appending a different branch's tail onto this one's.
  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [folder, status.branch]);

  useEffect(() => {
    const api = getGitApi();
    if (!api) {
      setError("Git provider (silo.git) unavailable.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .log(folder, limit)
      .then(async (entries) => {
        if (cancelled) return;
        setCommits(entries);
        // Detached HEAD: no branch, so "ahead of what?" doesn't apply.
        if (!status.branch) {
          setUnpushed(null);
        } else if (status.upstream) {
          const unmerged = await api.unmergedCommits(
            folder,
            status.branch,
            status.upstream,
          );
          if (!cancelled) setUnpushed(new Set(unmerged.map((c) => c.hash)));
        } else {
          // No upstream configured — nothing has ever been pushed, so every
          // commit currently loaded counts as unpushed.
          setUnpushed("all");
        }
      })
      .catch((err) => !cancelled && setError(String(err)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [folder, limit, status.branch, status.upstream]);

  function copyHash(hash: string) {
    void navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash((h) => (h === hash ? null : h)), 1500);
  }

  if (error) return <div className="placeholder">{error}</div>;
  if (loading && commits.length === 0) {
    return <div className="placeholder">Loading commits…</div>;
  }
  if (commits.length === 0) {
    return <div className="placeholder">No commits yet.</div>;
  }

  const canonicalDivider = dividerIndex(commits, unpushed);
  const divider = displayDividerIndex(canonicalDivider, commits.length, order);
  const displayCommits = orderedCommits(commits, order);
  // "Load more" fetches deeper (older) history, appended at the end of the
  // canonical newest-first array — which lands at the *start* of the display
  // list once reversed for oldest-first. Keep the button next to whichever
  // end that growth actually appears at.
  const loadMore = commits.length === limit && (
    <button
      className="git-commits-load-more"
      disabled={loading}
      onClick={() => setLimit((l) => l + PAGE_SIZE)}
    >
      {loading ? "Loading…" : "Load more"}
    </button>
  );

  return (
    <div className="git-commits-list">
      {unpushed === "all" && commits.length > 0 && (
        <div className="git-commit-note">No upstream — nothing pushed yet.</div>
      )}
      {order === "oldestFirst" && loadMore}
      {displayCommits.map((c, i) => (
        <div key={c.hash}>
          {i === divider && (
            <div className="git-commit-divider">
              ↑ {canonicalDivider} commit{canonicalDivider === 1 ? "" : "s"} ·
              not pushed
            </div>
          )}
          <div
            className="git-commit-row"
            role="button"
            tabIndex={0}
            onClick={() => onSelectCommit(c.hash)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelectCommit(c.hash);
              }
            }}
          >
            <div className="git-commit-subject" title={c.subject}>
              {c.subject}
            </div>
            <div className="git-commit-meta">
              <span className="git-commit-author">{c.author}</span>
              <span className="git-commit-date">{c.relativeDate}</span>
              <span className="git-commit-files">
                {c.filesChanged} file{c.filesChanged === 1 ? "" : "s"}
              </span>
            </div>
            <span
              className="git-commit-hash-action"
              onClick={(e) => e.stopPropagation()}
            >
              <Tooltip content={copiedHash === c.hash ? "Copied" : "Copy hash"}>
                <button
                  className="row-action"
                  tabIndex={-1}
                  onClick={() => copyHash(c.hash)}
                >
                  {copiedHash === c.hash ? (
                    <Check size={14} />
                  ) : (
                    <CopySimple size={14} />
                  )}
                </button>
              </Tooltip>
              <code className="git-commit-shorthash">{c.shortHash}</code>
            </span>
          </div>
        </div>
      ))}
      {order === "newestFirst" && loadMore}
    </div>
  );
}

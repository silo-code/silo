import { useEffect, useState } from "react";
import { File as FileIcon } from "@phosphor-icons/react";
import { Tooltip, type ExtensionContext } from "@silo-code/sdk";
import type {
  CommitDetail,
  CommitFileChange,
  GitAPI,
} from "@silo-code/git-api";
import { resolveDiffBase } from "../git/parse-commit-files";
import { formatAuthorDate } from "./commit-list-model";
import { ICON_OPEN } from "./git-icons";

function statusGlyph(status: CommitFileChange["status"]): string {
  return status;
}

/** Detail page of the "View Commits" flow: one commit's full message, stat
 * summary, and changed files. Row click opens the file's diff for this
 * commit (vs. its first parent, or the empty tree for a root commit) in the
 * center dock, same mechanism as the panel's root-level Changes list. The
 * document icon opens the file's *current* working-tree version — mirroring
 * what the root panel's "Open file" button does, not a historical snapshot
 * (there's no editor API for opening arbitrary read-only content outside a
 * diff) — so it's hidden for a deleted file, which has no current version. */
export function CommitDetailView({
  ctx,
  folder,
  workspaceId,
  hash,
}: {
  ctx: ExtensionContext;
  folder: string;
  workspaceId: string;
  hash: string;
}) {
  const [detail, setDetail] = useState<CommitDetail | null | undefined>(
    undefined,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const api = ctx.getExtension<GitAPI>("silo.git")?.api;
    if (!api) {
      setError("Git provider (silo.git) unavailable.");
      return;
    }
    let cancelled = false;
    setDetail(undefined);
    setError(null);
    api
      .commitDetail(folder, hash)
      .then((d) => !cancelled && setDetail(d))
      .catch((err) => !cancelled && setError(String(err)));
    return () => {
      cancelled = true;
    };
  }, [ctx, folder, hash]);

  if (error) return <div className="placeholder">{error}</div>;
  if (detail === undefined) {
    return <div className="placeholder">Loading commit…</div>;
  }
  if (detail === null) {
    return <div className="placeholder">Commit not found.</div>;
  }

  const totals = detail.files.reduce(
    (acc, f) => ({
      additions: acc.additions + (f.additions ?? 0),
      deletions: acc.deletions + (f.deletions ?? 0),
    }),
    { additions: 0, deletions: 0 },
  );

  function openDiff(file: CommitFileChange) {
    const filePath = `${folder}/${file.path}`;
    const base = file.path.split("/").pop() ?? file.path;
    ctx.editors.openDiff(
      {
        filePath,
        providerId: "silo.git",
        args: {
          mode: "commit",
          cwd: folder,
          commit: detail!.hash,
          parent: resolveDiffBase(detail!.parents),
        },
        title: `${base} (${detail!.shortHash})`,
      },
      { workspaceId, preview: true },
    );
  }

  function openCurrentFile(file: CommitFileChange) {
    ctx.editors.open(`${folder}/${file.path}`, { workspaceId });
  }

  return (
    <div className="git-commit-detail">
      <div className="git-commit-detail-message">
        <div className="git-commit-detail-subject">{detail.subject}</div>
        {detail.body && (
          <pre className="git-commit-detail-body">{detail.body}</pre>
        )}
        <div className="git-commit-detail-meta">
          <span>{detail.author}</span>
          <Tooltip content={formatAuthorDate(detail.authorDate)}>
            <span>{detail.relativeDate}</span>
          </Tooltip>
          <code>{detail.shortHash}</code>
        </div>
      </div>
      <div className="git-commit-detail-stats">
        {detail.files.length} file{detail.files.length === 1 ? "" : "s"} changed
        {(totals.additions > 0 || totals.deletions > 0) && (
          <>
            {" · "}
            <span className="git-stat-add">+{totals.additions}</span>{" "}
            <span className="git-stat-del">−{totals.deletions}</span>
          </>
        )}
      </div>
      <div className="git-commit-detail-files">
        {detail.files.map((f) => (
          <div
            key={f.path}
            className="git-file-row"
            onClick={() => openDiff(f)}
          >
            <span className="ico file">
              <FileIcon size="1.3em" weight="regular" aria-hidden="true" />
            </span>
            <Tooltip content={f.path}>
              <span className="file-name">{f.path.split("/").pop()}</span>
            </Tooltip>
            {f.origPath && (
              <span className="file-dir" title={`renamed from ${f.origPath}`}>
                ← {f.origPath}
              </span>
            )}
            <span className="row-actions" onClick={(e) => e.stopPropagation()}>
              {f.status !== "D" && (
                <Tooltip content="Open file">
                  <button
                    className="row-action"
                    tabIndex={-1}
                    onClick={() => openCurrentFile(f)}
                  >
                    {ICON_OPEN}
                  </button>
                </Tooltip>
              )}
            </span>
            {f.binary ? (
              <span className="git-file-stat binary">binary</span>
            ) : (f.additions ?? 0) > 0 || (f.deletions ?? 0) > 0 ? (
              <span className="git-file-stat">
                <span className="git-stat-add">+{f.additions}</span>{" "}
                <span className="git-stat-del">−{f.deletions}</span>
              </span>
            ) : null}
            <span className={`status-glyph status-${statusGlyph(f.status)}`}>
              {f.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

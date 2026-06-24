import type { SearchFileResult, SearchMatch } from "@silo-code/sdk";
import { clampPreviewStart, highlightSegments } from "./search-model";
import { ICON_CHEV_DOWN, ICON_CHEV_RIGHT, ICON_FILE } from "./search-icons";

/** Base name + parent dir of a workspace-relative path (for the file row). */
function splitPath(path: string): { name: string; dir: string } {
  const parts = path.split("/");
  const name = parts.pop() ?? path;
  return { name, dir: parts.join("/") };
}

/** Stable key for a file result — includes root so same-relative-path files
 *  from different roots don't collide in the collapsed set or React keys. */
function fileKey(file: SearchFileResult): string {
  return file.root ? `${file.root}:${file.path}` : file.path;
}

function MatchRow({
  match,
  onOpen,
}: {
  match: SearchMatch;
  onOpen: (match: SearchMatch) => void;
}) {
  const clamped = clampPreviewStart(match.preview, match.ranges);
  const segments = highlightSegments(clamped.preview, clamped.ranges);
  return (
    <button
      type="button"
      className="fsearch-match"
      title={match.preview}
      onClick={() => onOpen(match)}
    >
      <span className="fsearch-match-text">
        {segments.map((seg, i) =>
          seg.match ? (
            <mark key={i} className="fsearch-hit">
              {seg.text}
            </mark>
          ) : (
            <span key={i}>{seg.text}</span>
          ),
        )}
      </span>
    </button>
  );
}

export function SearchResults({
  files,
  isMultiFolder,
  collapsed,
  onToggleFile,
  onOpenMatch,
}: {
  files: SearchFileResult[];
  isMultiFolder: boolean;
  collapsed: ReadonlySet<string>;
  onToggleFile: (key: string) => void;
  onOpenMatch: (file: SearchFileResult, match: SearchMatch) => void;
}) {
  // Group consecutive files by root so we can render a folder header between
  // groups when the workspace has more than one root folder.
  const groups: Array<{ root: string | undefined; files: SearchFileResult[] }> =
    [];
  for (const file of files) {
    const last = groups[groups.length - 1];
    if (last && last.root === file.root) {
      last.files.push(file);
    } else {
      groups.push({ root: file.root, files: [file] });
    }
  }

  return (
    <>
      {groups.map(({ root, files: groupFiles }, gi) => (
        <div key={root ?? gi} className="fsearch-group">
          {isMultiFolder && root && (
            <div className="fsearch-folder-header" title={root}>
              <span>{root.split("/").pop() ?? root}</span>
            </div>
          )}
          {groupFiles.map((file) => {
            const key = fileKey(file);
            const { name, dir } = splitPath(file.path);
            const isCollapsed = collapsed.has(key);
            return (
              <div key={key} className="fsearch-file">
                <button
                  type="button"
                  className="fsearch-file-head"
                  onClick={() => onToggleFile(key)}
                  title={file.path}
                >
                  <span className="fsearch-chev">
                    {isCollapsed ? ICON_CHEV_RIGHT : ICON_CHEV_DOWN}
                  </span>
                  <span className="fsearch-file-icon">{ICON_FILE}</span>
                  <span className="fsearch-file-name">{name}</span>
                  {dir && <span className="fsearch-file-dir">{dir}</span>}
                  <span className="fsearch-file-count">
                    {file.matches.length}
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="fsearch-match-list">
                    {file.matches.map((match, i) => (
                      <MatchRow
                        key={`${match.line}:${i}`}
                        match={match}
                        onOpen={(m) => onOpenMatch(file, m)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

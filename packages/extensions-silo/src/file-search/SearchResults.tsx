import type { SearchFileResult, SearchMatch } from "@silo-code/sdk";
import { clampPreviewStart, highlightSegments } from "./search-model";
import { ICON_CHEV_DOWN, ICON_CHEV_RIGHT, ICON_FILE } from "./search-icons";

/** Base name + parent dir of a workspace-relative path (for the file row). */
function splitPath(path: string): { name: string; dir: string } {
  const parts = path.split("/");
  const name = parts.pop() ?? path;
  return { name, dir: parts.join("/") };
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
  collapsed,
  onToggleFile,
  onOpenMatch,
}: {
  files: SearchFileResult[];
  collapsed: ReadonlySet<string>;
  onToggleFile: (path: string) => void;
  onOpenMatch: (file: SearchFileResult, match: SearchMatch) => void;
}) {
  return (
    <div className="fsearch-results">
      {files.map((file) => {
        const { name, dir } = splitPath(file.path);
        const isCollapsed = collapsed.has(file.path);
        return (
          <div key={file.path} className="fsearch-file">
            <button
              type="button"
              className="fsearch-file-head"
              onClick={() => onToggleFile(file.path)}
              title={file.path}
            >
              <span className="fsearch-chev">
                {isCollapsed ? ICON_CHEV_RIGHT : ICON_CHEV_DOWN}
              </span>
              <span className="fsearch-file-icon">{ICON_FILE}</span>
              <span className="fsearch-file-name">{name}</span>
              {dir && <span className="fsearch-file-dir">{dir}</span>}
              <span className="fsearch-file-count">{file.matches.length}</span>
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
  );
}

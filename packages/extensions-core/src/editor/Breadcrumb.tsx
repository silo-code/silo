import "./Breadcrumb.css";

interface Props {
  filePath: string | null;
  workspaceFolder: string | undefined;
  /** Glyph on the trailing segment: a file (editors), a folder (the terminal's
   *  cwd), or none. Defaults to "file". */
  leafIcon?: "file" | "folder" | "none";
}

interface Segment {
  text: string;
  isLeaf: boolean;
}

function computeSegments(
  filePath: string | null,
  workspaceFolder: string | undefined,
): Segment[] {
  if (!filePath) return [{ text: "Untitled", isLeaf: true }];

  const ws = workspaceFolder?.replace(/\/+$/, "") ?? "";
  if (ws && (filePath === ws || filePath.startsWith(ws + "/"))) {
    const wsParent = ws.split("/").slice(-2, -1)[0] ?? "";
    const wsName = ws.split("/").slice(-1)[0] ?? "";
    const rel = filePath === ws ? "" : filePath.slice(ws.length + 1);
    const relParts = rel ? rel.split("/") : [];
    const head = [wsParent, wsName].filter(Boolean);
    const parts = [...head, ...relParts];
    return parts.map((text, i) => ({ text, isLeaf: i === parts.length - 1 }));
  }

  const parts = filePath.split("/").filter(Boolean);
  return parts.map((text, i) => ({ text, isLeaf: i === parts.length - 1 }));
}

function FileGlyph() {
  return (
    <svg
      className="breadcrumb__icon"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        d="M9 1H3.5A1.5 1.5 0 0 0 2 2.5v11A1.5 1.5 0 0 0 3.5 15h9a1.5 1.5 0 0 0 1.5-1.5V6L9 1z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path
        d="M9 1v4.5A.5.5 0 0 0 9.5 6H14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FolderGlyph() {
  return (
    <svg
      className="breadcrumb__icon"
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        d="M1.5 4a1 1 0 0 1 1-1h3l1.2 1.4H13.5a1 1 0 0 1 1 1V12a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1V4z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * Presentational breadcrumb bar shown at the top of file-backed panels.
 * Renders the workspace-relative path as chevron-separated segments, with a
 * leaf glyph on the trailing segment (a file for editors, a folder for the
 * terminal's working directory).
 */
export function Breadcrumb({
  filePath,
  workspaceFolder,
  leafIcon = "file",
}: Props) {
  const segments = computeSegments(filePath, workspaceFolder);

  return (
    <div className="breadcrumb" title={filePath ?? "Untitled"}>
      {segments.map((seg, i) => (
        <span key={i} className="breadcrumb__crumb">
          {i > 0 && (
            <svg
              className="breadcrumb__sep"
              width="12"
              height="12"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <path
                d="M6 3l5 5-5 5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          )}
          {seg.isLeaf && leafIcon === "file" && <FileGlyph />}
          {seg.isLeaf && leafIcon === "folder" && <FolderGlyph />}
          <span className="breadcrumb__label">{seg.text}</span>
        </span>
      ))}
    </div>
  );
}

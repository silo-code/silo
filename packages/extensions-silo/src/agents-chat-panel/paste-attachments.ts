/**
 * Classify a composer paste as file paths, binary files, or ordinary text.
 *
 * Finder copies usually land as `text/uri-list` (and sometimes `file://` in
 * `text/plain`). Screenshots and image copies land as `clipboardData.files`
 * / `items` with no path — those have to be written to disk before they can
 * become a `resource_link`. Pure so the "is this a file paste?" rule is
 * tested without a textarea.
 */

const FILE_URI = /^file:\/\//i;
const POSIX_ABS = /^\//;
const WIN_ABS = /^[A-Za-z]:[\\/]/;
const FILE_EXT = /\.[A-Za-z0-9]{1,12}$/;

const MIME_EXT: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
};

/** One clipboard line as an absolute filesystem path, or `undefined`. */
export function filePathFromLine(raw: string): string | undefined {
  const line = raw.trim();
  if (!line || line.startsWith("#")) return undefined;
  if (FILE_URI.test(line)) {
    try {
      const u = new URL(line);
      if (u.protocol !== "file:") return undefined;
      let p = decodeURIComponent(u.pathname);
      // `file:///C:/foo` → `/C:/foo`; strip the extra slash before the drive.
      if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
      return p;
    } catch {
      return undefined;
    }
  }
  if (POSIX_ABS.test(line) || WIN_ABS.test(line)) return line;
  return undefined;
}

/**
 * Parse clipboard text as a file list. Returns `[]` unless every non-empty,
 * non-comment line is a path — mixed prose must stay a normal text paste.
 *
 * `barePathNeedsExtension` (for `text/plain`) rejects `/usr/bin/env python…`
 * style lines that happen to start with `/`.
 */
export function filePathsFromClipboardText(
  text: string,
  opts?: { barePathNeedsExtension?: boolean },
): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));
  if (lines.length === 0) return [];
  const paths: string[] = [];
  for (const line of lines) {
    const p = filePathFromLine(line);
    if (!p) return [];
    if (
      opts?.barePathNeedsExtension &&
      !FILE_URI.test(line) &&
      (/\s/.test(line) || !FILE_EXT.test(p.replace(/[/\\]+$/, "")))
    ) {
      return [];
    }
    paths.push(p);
  }
  return paths;
}

/** Prefer `text/uri-list`; fall back to path-only `text/plain`. */
export function filePathsFromClipboardGetData(
  getData: (type: string) => string,
): string[] {
  const fromList = filePathsFromClipboardText(getData("text/uri-list") ?? "");
  if (fromList.length > 0) return fromList;
  return filePathsFromClipboardText(getData("text/plain") ?? "", {
    barePathNeedsExtension: true,
  });
}

export type ClassifiedPaste =
  | { kind: "paths"; paths: string[] }
  | { kind: "files" }
  | { kind: "none" };

/**
 * Paths win when both a uri-list and a FileList are present (Finder copy) —
 * those point at the original file. A non-empty FileList with no paths is
 * a screenshot / image copy that has to be written out.
 */
export function classifyClipboardPaste(opts: {
  getData: (type: string) => string;
  fileCount: number;
}): ClassifiedPaste {
  const paths = filePathsFromClipboardGetData(opts.getData);
  if (paths.length > 0) return { kind: "paths", paths };
  if (opts.fileCount > 0) return { kind: "files" };
  return { kind: "none" };
}

/** Filename for a pasted blob: the File's name, or one derived from its MIME. */
export function pastedFileName(originalName: string, mimeType: string): string {
  const trimmed = originalName.replace(/[/\\]+$/, "");
  const base = (trimmed.split(/[/\\]/).pop() ?? "").trim();
  if (base) return base;
  const ext = MIME_EXT[mimeType] ?? "";
  return ext ? `paste${ext}` : "paste";
}

/** Absolute dest under the extension's storage dir (`writeBytes` makes parents). */
export function pastedFilePath(
  storageDir: string,
  name: string,
  stamp: number,
): string {
  const dir = storageDir.replace(/[/\\]+$/, "");
  return `${dir}/pasted/${stamp}-${name}`;
}

import type { SearchOptions, SearchResponse } from "@silo-code/sdk";

// Pure, UI-free helpers for the file-search panel — extracted so the search
// rules (option building, glob parsing, preview highlighting, the summary line)
// are unit-testable without rendering React.

/**
 * In-session state cached per workspace so switching back doesn't re-run the
 * search or lose the collapse and scroll position. Not persisted to disk —
 * lives in a Map ref in FileSearchPanel for the lifetime of the panel instance.
 */
export interface WorkspaceViewCache {
  response: SearchResponse | null;
  collapsed: ReadonlySet<string>;
  scrollTop: number;
}

/** The panel's query controls, persisted across reloads. */
export interface SearchUiState {
  query: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  /** Raw comma-separated "files to include" globs. */
  includes: string;
  /** Raw comma-separated "files to exclude" globs. */
  excludes: string;
}

export const EMPTY_UI_STATE: SearchUiState = {
  query: "",
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  includes: "",
  excludes: "",
};

/** Split a comma-separated glob field into trimmed, non-empty patterns. */
export function parseGlobs(csv: string): string[] {
  return csv
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Translate the UI controls into the SDK {@link SearchOptions} payload. */
export function buildSearchOptions(
  ui: SearchUiState,
  cwd?: string,
): SearchOptions {
  return {
    cwd,
    regex: ui.regex,
    caseSensitive: ui.caseSensitive,
    wholeWord: ui.wholeWord,
    includeGlobs: parseGlobs(ui.includes),
    excludeGlobs: parseGlobs(ui.excludes),
  };
}

/** One run of preview text, flagged as a highlighted match or plain. */
export interface PreviewSegment {
  text: string;
  match: boolean;
}

/**
 * Split a preview line into highlighted / plain segments from match `ranges`
 * (UTF-16 `[start, end)` offsets, the units `String.prototype.slice` uses).
 * Tolerates unsorted, overlapping, and out-of-bounds ranges.
 */
export function highlightSegments(
  preview: string,
  ranges: Array<[number, number]>,
): PreviewSegment[] {
  const valid = ranges.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  if (valid.length === 0) return [{ text: preview, match: false }];

  const segments: PreviewSegment[] = [];
  // Append text, coalescing into the previous run when it has the same flag —
  // so adjacent/overlapping matches render as one highlight, not several.
  const push = (text: string, match: boolean) => {
    if (text === "") return;
    const last = segments[segments.length - 1];
    if (last && last.match === match) last.text += text;
    else segments.push({ text, match });
  };

  let cursor = 0;
  for (const [start, end] of valid) {
    const s = Math.max(cursor, Math.min(start, preview.length));
    const e = Math.max(s, Math.min(end, preview.length));
    push(preview.slice(cursor, s), false);
    push(preview.slice(s, e), true);
    cursor = Math.max(cursor, e);
  }
  push(preview.slice(cursor), false);
  return segments;
}

/** Chars of context kept before the first match when trimming a long line. */
export const MATCH_LEAD_CONTEXT = 8;

/**
 * Trim the **start** of a preview when the first match sits far into a long line,
 * so the highlight is visible in a narrow panel instead of scrolling off the
 * right edge. Keeps {@link MATCH_LEAD_CONTEXT} chars before the match, prepends a
 * leading ellipsis, and shifts the `ranges` to match (UTF-16 offsets, the units
 * `String.prototype.slice` uses). A no-op when the first match is already near
 * the start. The trailing end is left to the CSS `text-overflow: ellipsis`.
 */
export function clampPreviewStart(
  preview: string,
  ranges: Array<[number, number]>,
  lead = MATCH_LEAD_CONTEXT,
): { preview: string; ranges: Array<[number, number]> } {
  if (ranges.length === 0) return { preview, ranges };
  const firstStart = Math.min(...ranges.map(([s]) => s));
  if (firstStart <= lead) return { preview, ranges };

  const ellipsis = "…";
  const cut = firstStart - lead;
  // A char at index i moves to i - cut, then + ellipsis.length for the prefix.
  const shift = ellipsis.length - cut;
  const clamped = ellipsis + preview.slice(cut);
  const shifted = ranges
    .map(([s, e]): [number, number] => [s + shift, e + shift])
    .filter(([, e]) => e > ellipsis.length)
    .map(([s, e]): [number, number] => [Math.max(ellipsis.length, s), e]);
  return { preview: clamped, ranges: shifted };
}

/** The "N results in M files" summary (or a truncation-aware variant). */
export function summarize(
  totalMatches: number,
  fileCount: number,
  truncated = false,
): string {
  if (totalMatches === 0) return "No results";
  const results = totalMatches === 1 ? "1 result" : `${totalMatches} results`;
  const files = fileCount === 1 ? "1 file" : `${fileCount} files`;
  const base = `${results} in ${files}`;
  return truncated ? `${base} (truncated)` : base;
}

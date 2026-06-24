// `ctx.search` — cross-file content search over the workspace. The core
// primitive under the Search panel (and future quick-open / find-references).
// Backed by a native search engine in the host; results come back grouped by
// file so a UI can render collapsible per-file sections with line previews.

/**
 * Options for {@link SearchService.search}. All flags default to off / empty;
 * an omitted `options` runs a plain, case-insensitive substring search over the
 * active workspace, respecting `.gitignore`.
 *
 * @category Consumer Services
 * @public
 */
export interface SearchOptions {
  /**
   * Search root. Defaults to the open **workspace folder** when omitted. A `cwd`
   * outside the workspace throws {@link PathDeniedError} unless the extension
   * declared the `process` {@link Permission}; first-party extensions are unscoped.
   * Ignored when {@link SearchOptions.cwds} is non-empty.
   */
  cwd?: string;
  /**
   * Multiple search roots. When provided, all listed folders are searched and
   * results are merged. Each root is subject to the same scope guard as `cwd`.
   * Takes precedence over `cwd` when non-empty.
   */
  cwds?: string[];
  /** Treat `query` as a regular expression instead of a literal string. */
  regex?: boolean;
  /** Match case exactly. When false (default), the search is case-insensitive. */
  caseSensitive?: boolean;
  /** Match whole words only (word boundaries around the query). */
  wholeWord?: boolean;
  /**
   * Glob patterns of files to include (e.g. `["*.ts", "src/**"]`). When empty,
   * all files are eligible (still subject to `.gitignore` and `excludeGlobs`).
   */
  includeGlobs?: string[];
  /** Glob patterns of files to exclude (e.g. `["**\/dist/**"]`), on top of `.gitignore`. */
  excludeGlobs?: string[];
  /**
   * Cap on the total number of matches collected across all files. When the cap
   * is hit, the search stops early and {@link SearchResponse.truncated} is true.
   */
  maxResults?: number;
}

/**
 * One matching line within a file, returned in {@link SearchFileResult.matches}.
 *
 * @category Consumer Services
 * @public
 */
export interface SearchMatch {
  /** 1-indexed line number of the match within the file. */
  line: number;
  /**
   * The matched line's text, suitable for a preview. Very long lines are
   * truncated by the host; `ranges` are adjusted to stay valid against this string.
   */
  preview: string;
  /**
   * Character ranges of the matches within {@link SearchMatch.preview}, each
   * `[start, end)` (0-indexed, end-exclusive). A line can contain several matches.
   */
  ranges: Array<[number, number]>;
}

/**
 * All matches for a single file, returned in {@link SearchResponse.files}.
 *
 * @category Consumer Services
 * @public
 */
export interface SearchFileResult {
  /**
   * Absolute path of the search root this file lives under. Present when
   * searching multiple roots (via {@link SearchOptions.cwds}); omitted for
   * single-root searches where the caller already knows the root.
   */
  root?: string;
  /** File path **relative to** `root` (or the search `cwd` for single-root searches). */
  path: string;
  /** The matching lines within this file, in file order. */
  matches: SearchMatch[];
}

/**
 * The result of a {@link SearchService.search} call — matches grouped by file
 * plus totals for the summary line ("N results in M files").
 *
 * @category Consumer Services
 * @public
 */
export interface SearchResponse {
  /** Files that contained at least one match, in traversal order. */
  files: SearchFileResult[];
  /** Total number of matches across every file. */
  totalMatches: number;
  /**
   * True when the search stopped early at {@link SearchOptions.maxResults} — the
   * results are a prefix, not the complete set.
   */
  truncated: boolean;
}

/**
 * Cross-file content search, exposed as {@link ExtensionContext.search}. Runs a
 * native search engine in the host (off the UI thread) over the workspace,
 * honoring `.gitignore`, and resolves with matches grouped by file.
 *
 * The contract is intentionally extensible: a future replace capability can be
 * added as an additional method without breaking this one, and
 * {@link SearchMatch.ranges} + {@link SearchFileResult.path} already carry the
 * precise locations such a replace would target.
 *
 * @category Consumer Services
 * @public
 */
export interface SearchService {
  /**
   * Search file contents under {@link SearchOptions.cwd} (the active workspace
   * folder by default). Resolves with an empty {@link SearchResponse} for an
   * empty `query`. Rejects only if the search could not be started (e.g. the cwd
   * is denied); a search that simply finds nothing resolves with no files.
   *
   * @param query - The text or regex (see {@link SearchOptions.regex}) to find.
   * @param options - Optional {@link SearchOptions}.
   * @example
   * ```ts
   * const { files, totalMatches } = await ctx.search.search("tokyo", {
   *   caseSensitive: false,
   *   excludeGlobs: ["**\/dist/**"],
   * });
   * ```
   */
  search(query: string, options?: SearchOptions): Promise<SearchResponse>;
}

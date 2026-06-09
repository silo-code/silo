// Pure helper behind the Git panel's error toasts (see GitView's `notifyError`).
// Turns a thrown value into a one-line `summary` for the toast plus the full
// `detail` for the "View details" modal, and decides whether that modal is worth
// offering (`hasMore`). Kept separate from the React/`ctx` wiring so it's unit
// testable.

/** The pieces of a git failure a toast needs (see {@link summarizeGitError}). */
export interface GitErrorSummary {
  /** Full error text — git's stderr, with a leading `Error:` and whitespace trimmed. */
  detail: string;
  /** First line of {@link GitErrorSummary.detail}, or `fallback` when it's empty. */
  summary: string;
  /** True when `detail` has more than the `summary` line — i.e. a details modal is worth showing. */
  hasMore: boolean;
}

/**
 * Summarize a thrown git error for a toast. `fallback` (a short action title like
 * `"Commit failed"`) is used as the summary only when the error has no text.
 */
export function summarizeGitError(
  err: unknown,
  fallback: string,
): GitErrorSummary {
  const detail = String(err)
    .replace(/^Error:\s*/, "")
    .trim();
  const summary = detail.split("\n")[0] || fallback;
  const hasMore = detail.length > summary.length;
  return { detail, summary, hasMore };
}

// Pure helper behind the Git panel's error toasts (see GitView's `notifyError`).
// Turns a thrown value into a one-line `summary` for the toast plus the full
// `detail` for the "View details" modal, and decides whether that modal is worth
// offering (`hasMore`). Kept separate from the React/`ctx` wiring so it's unit
// testable.

/** The pieces of a git failure a toast needs (see {@link summarizeGitError}). */
export interface GitErrorSummary {
  /** Full error text — git's stderr, with a leading `Error:` and whitespace trimmed. */
  detail: string;
  /** The most relevant line of {@link GitErrorSummary.detail}, or `fallback` when it's empty. */
  summary: string;
  /** True when `detail` has more than the `summary` line — i.e. a details modal is worth showing. */
  hasMore: boolean;
}

/** A line that reads like a conclusive failure (commitlint/lint/test output). */
const ERROR_MARKER = /(✖|✗|\b(?:failed|blocked|error|fatal)\b)/i;

// eslint-disable-next-line no-control-regex -- matches raw ANSI escape codes to strip them
const ANSI_ESCAPE = /\x1b\[[0-9;]*[a-zA-Z]/g;

/**
 * Strip ANSI color/cursor escape codes. Hook output (pnpm/turbo/vitest) is
 * colorized for a terminal; piped through a thrown error and rendered in
 * `<pre>`, those codes show up as literal garbage like `[32m✓[39m`.
 */
function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE, "");
}

/**
 * Pick the line that best explains the failure. Plain git errors put the reason
 * on a `fatal:`/`error:` line, so prefer that. Hook output (lint, commitlint,
 * tests) buries the reason under progress lines like "→ Running boundary lint…",
 * so fall back to the *last* line that reads like a failure, then to the last
 * line overall.
 */
function pickSummaryLine(detail: string): string | undefined {
  const lines = detail
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return undefined;
  const native = lines.find((l) => /^(?:fatal|error):/i.test(l));
  if (native) return native;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (ERROR_MARKER.test(lines[i])) return lines[i];
  }
  return lines[lines.length - 1];
}

/**
 * Summarize a thrown git error for a toast. `fallback` (a short action title like
 * `"Commit failed"`) is used as the summary only when the error has no text.
 */
export function summarizeGitError(
  err: unknown,
  fallback: string,
): GitErrorSummary {
  const detail = stripAnsi(String(err))
    .replace(/^Error:\s*/, "")
    .trim();
  const summary = pickSummaryLine(detail) ?? fallback;
  const hasMore = detail.length > summary.length;
  return { detail, summary, hasMore };
}

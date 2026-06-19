/**
 * Pure helpers for the web-viewer panel — URL normalization and in-memory
 * navigation history. Kept separate so the logic is unit-testable without
 * mounting a component.
 */

const SCHEME_RE = /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//;

/**
 * Normalize a raw user-typed string into a navigable URL.
 * - Prepends `https://` when no scheme is present.
 * - Returns `null` for strings that are unparseable even after prepending.
 */
export function normalizeUrl(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const withScheme = SCHEME_RE.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    new URL(withScheme);
    return withScheme;
  } catch {
    return null;
  }
}

/**
 * Returns true for URLs that are local to the machine:
 * `http://localhost:*`, `http://127.0.0.1:*`, or `file://`.
 */
export function isLocalUrl(url: string): boolean {
  try {
    const { protocol, hostname } = new URL(url);
    return (
      protocol === "file:" ||
      (protocol === "http:" &&
        (hostname === "localhost" || hostname === "127.0.0.1"))
    );
  } catch {
    return false;
  }
}

/**
 * Append `url` to the history stack, trimming any forward entries beyond
 * `index`. Returns a new `{ history, index }` — does not mutate the inputs.
 */
export function pushHistory(
  history: string[],
  index: number,
  url: string,
): { history: string[]; index: number } {
  const base = history.slice(0, index + 1);
  return { history: [...base, url], index: base.length };
}

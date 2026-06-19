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
 * Derive a tab title from a URL for use when the page title is unavailable
 * (cross-origin load) or empty. Returns the hostname for http/https, the
 * path for file://, or the full URL as a last resort.
 */
export function tabTitleFromUrl(url: string): string {
  try {
    const { protocol, hostname, pathname } = new URL(url);
    if (protocol === "file:") return pathname.split("/").pop() || pathname;
    return hostname;
  } catch {
    return url;
  }
}

/**
 * Fetch the HTML at `url` and parse its `<title>` element. Returns `null` if
 * the request fails (CORS block, network error, non-HTML response, timeout).
 * Used to get real page titles for cross-origin frames where `contentDocument`
 * is inaccessible — local dev servers (Vite, etc.) allow CORS so it succeeds
 * there; external sites typically do not, and the caller falls back to hostname.
 */
export async function fetchPageTitle(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("text/html")) return null;
    const html = await res.text();
    const match = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    return match?.[1]?.trim() || null;
  } catch {
    return null;
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

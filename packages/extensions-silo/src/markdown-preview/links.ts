// Classifying a clicked link in the Markdown preview. Pure logic, kept out of
// the React component so it's unit-testable — the component is thin glue that
// turns these results into `ctx.editors.open` / `ctx.ui.openExternal` / a scroll.

/**
 * What a clicked preview link resolves to:
 * - `anchor` — a same-document `#id` fragment; scroll the matching element into view.
 * - `external` — an `http(s)`/`mailto` URL; hand to `ctx.ui.openExternal`.
 * - `file` — a workspace-relative or absolute path; open via `ctx.editors.open`.
 * - `ignore` — anything else (other schemes, protocol-relative, empty); do nothing.
 */
export type MarkdownLink =
  | { kind: "anchor"; id: string }
  | { kind: "external"; url: string }
  | { kind: "file"; path: string }
  | { kind: "ignore" };

// http/https/mailto are the schemes the host opener accepts (see UiService.openExternal).
const EXTERNAL_SCHEME = /^(?:https?|mailto):/i;
// Any explicit URL scheme, e.g. `file:`, `javascript:`, `tel:`, `vscode:`.
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** Decode `%20` etc., tolerating a malformed sequence rather than throwing. */
function decode(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * Classify an `<a href>` clicked inside the Markdown preview, relative to the
 * previewed file at `filePath` (the file currently rendered; `null` for an
 * untitled buffer — then relative links can't be resolved and are ignored).
 */
export function classifyMarkdownLink(
  href: string,
  filePath: string | null,
): MarkdownLink {
  const raw = href.trim();
  if (!raw) return { kind: "ignore" };

  // Same-document fragment.
  if (raw.startsWith("#")) return { kind: "anchor", id: decode(raw.slice(1)) };

  // Explicit scheme: open http(s)/mailto, ignore everything else (file:,
  // javascript:, tel:, …) so the preview can't smuggle a dangerous scheme.
  if (EXTERNAL_SCHEME.test(raw)) return { kind: "external", url: raw };
  if (ANY_SCHEME.test(raw)) return { kind: "ignore" };

  // Protocol-relative URL (`//host/...`) — not a file path; leave it alone.
  if (raw.startsWith("//")) return { kind: "ignore" };

  // Otherwise a relative or absolute file path. Drop any `?query`/`#fragment`
  // before resolving — the editor opens a file, not a URL.
  const path = resolveFilePath(raw.split(/[?#]/, 1)[0], filePath);
  return path ? { kind: "file", path } : { kind: "ignore" };
}

/**
 * Resolve a link path against the previewed file's directory, POSIX-style
 * (the app is macOS). Returns an absolute path, or `null` when it can't resolve
 * (no `filePath`, or an empty link). Hand-rolled rather than using `node:path`,
 * which extensions are banned from importing.
 */
export function resolveFilePath(
  link: string,
  filePath: string | null,
): string | null {
  if (!filePath) return null;
  const rel = decode(link);
  if (!rel) return null;

  const isAbsolute = rel.startsWith("/");
  const base = isAbsolute ? "" : dirname(filePath);
  const stack: string[] = [];
  for (const seg of `${base}/${rel}`.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      stack.pop();
      continue;
    }
    stack.push(seg);
  }
  return `/${stack.join("/")}`;
}

/** POSIX dirname: the path up to (not including) the last `/`. */
function dirname(p: string): string {
  const i = p.lastIndexOf("/");
  return i <= 0 ? "/" : p.slice(0, i);
}

/**
 * Detect URL and file-path spans in chat transcript text.
 *
 * Path matching is borrowed from
 * `packages/extensions-core/src/terminal/terminal-link-match.ts` — a silo.*
 * extension cannot import that package, and the rules must stay the same so
 * a path underlined in a terminal is underlined here too.
 */

export type ChatLinkKind = "url" | "path";

export interface ChatLinkSpan {
  readonly kind: ChatLinkKind;
  readonly text: string;
  readonly index: number;
}

const PATH_CHARS = String.raw`[A-Za-z0-9_./\-@+]`;
function pathBody(chars: string): string {
  return String.raw`(?:(?:~|\.{1,2})?\/${chars}+|\.?[A-Za-z0-9_\-@+]+\/${chars}*\.[A-Za-z0-9_\-@+]+)`;
}
const LINE_COL_SUFFIX = String.raw`(?::\d+(?::\d+)?)?`;
const BARE = String.raw`(?<![A-Za-z0-9_.:/\-@+])${pathBody(PATH_CHARS)}${LINE_COL_SUFFIX}`;

const PATH_CHARS_SPACED = String.raw`[A-Za-z0-9_./\-@+ ]`;
const DELIMITER_PAIRS: Array<[string, string]> = [
  ["(", ")"],
  ["[", "]"],
  ['"', '"'],
  ["'", "'"],
];
function delimited(open: string, close: string): string {
  const o = `\\${open}`;
  const c = `\\${close}`;
  return String.raw`(?<=${o})${pathBody(PATH_CHARS_SPACED)}${LINE_COL_SUFFIX}(?=${c})`;
}

const FILE_PATH_RE = new RegExp(
  [...DELIMITER_PAIRS.map(([o, c]) => delimited(o, c)), BARE].join("|"),
  "g",
);
const TRAILING_PUNCT_RE = /[.,;:)\]}>'"]+$/;

const URL_RE = /\b(?:https?|file):\/\/[^\s<>"'`]+/gi;
const TRAILING_URL_PUNCT_RE = /[).,;:!?]+$/;

function stripTrailing(text: string, trailing: RegExp): string {
  const m = text.match(trailing);
  return m ? text.slice(0, -m[0].length) : text;
}

function collect(
  text: string,
  re: RegExp,
  kind: ChatLinkKind,
  trailing: RegExp,
): ChatLinkSpan[] {
  const out: ChatLinkSpan[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const matchText = stripTrailing(m[0], trailing);
    if (!matchText) continue;
    out.push({ kind, text: matchText, index: m.index });
  }
  return out;
}

function overlaps(a: ChatLinkSpan, b: ChatLinkSpan): boolean {
  return a.index < b.index + b.text.length && b.index < a.index + a.text.length;
}

/** URL and file-path spans in `text`, URLs first so a path inside a URL is not also linked. */
export function matchChatLinks(text: string): ChatLinkSpan[] {
  const urls = collect(text, URL_RE, "url", TRAILING_URL_PUNCT_RE);
  const paths = collect(text, FILE_PATH_RE, "path", TRAILING_PUNCT_RE).filter(
    (p) => !urls.some((u) => overlaps(p, u)),
  );
  return [...urls, ...paths].sort((a, b) => a.index - b.index);
}

/** `http(s):` / `file:` are URLs; everything else is a path (markdown `[x](src/a.ts)`). */
export function kindFromHref(href: string): ChatLinkKind {
  return /^(https?:|file:)/i.test(href) ? "url" : "path";
}

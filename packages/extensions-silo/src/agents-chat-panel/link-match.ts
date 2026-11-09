/**
 * Detect URL and file-path spans in chat transcript text.
 *
 * Path matching is borrowed from
 * `packages/extensions-core/src/terminal/terminal-link-match.ts` — a silo.*
 * extension cannot import that package, and the rules should otherwise stay
 * the same so a path underlined in a terminal is underlined here too. One
 * intentional divergence: a bare filename with no directory component (no
 * `/` at all, e.g. a tool call titled just `tool-demo.txt`) still links here
 * as long as it has a exactly-3-character extension (Dave's call — the
 * terminal has no equivalent "the agent named its own file" case driving
 * this). A shorter or longer extension doesn't count, which is also what
 * keeps this from lighting up every "Node.js" or "config.json" mentioned in
 * prose.
 *
 * A directory segment may carry single interior spaces
 * (`~/Blog Posts/Shift.md`) — the space is absorbed only when its segment is
 * immediately followed by a separator, which is what proves the space was
 * interior to the path rather than the end of it. The last segment stays
 * space-free unless a delimiter pair bounds the whole path, so an
 * undelimited `~/My Notes/Trip Notes.md` links only `~/My Notes/Trip`.
 *
 * Windows paths are rooted at a drive letter (`C:\Users\me\silo.exe`) and
 * match whole. A bare `dir\file.ts` deliberately doesn't: a lone backslash is
 * more often an escape than a separator, and nothing distinguishes the two
 * without the drive. The backslash also joins the lookbehind, so an
 * unrooted `$env:LOCALAPPDATA\silo.exe` links nothing rather than linking
 * the trailing `silo.exe` on its own — a path fragment the editor can't open
 * and the reader didn't mean.
 */

export type ChatLinkKind = "url" | "path";

export interface ChatLinkSpan {
  readonly kind: ChatLinkKind;
  /** The characters the span covers — what gets underlined. */
  readonly text: string;
  readonly index: number;
  /** What the span opens. Differs from {@link text} where the written form is
   *  not the path itself: `Blog\ Posts/a.md` underlines the escapes but opens
   *  `Blog Posts/a.md`, and a `file://` URL opens its decoded path. */
  readonly href: string;
}

const PATH_CHARS = String.raw`[A-Za-z0-9_./\-@+]`;
// Windows segments are separated by `\`, but `C:/Users/me` is equally valid,
// so both separators are in play once a drive letter has rooted the path.
const WIN_DRIVE = String.raw`[A-Za-z]:[\\/]`;
const BARE_FILENAME_3 = String.raw`[A-Za-z0-9_\-@+]+\.[A-Za-z0-9]{3}(?![A-Za-z0-9])`;
// One path segment. A backslash-escaped space is *part of* a segment, not a
// boundary — it is how a shell, and most CLI output, writes a space it means
// literally. Unlike a bare space it needs no "a separator follows" proof: the
// escape is the proof, so it is allowed in the last segment too.
const SEG = String.raw`(?:[A-Za-z0-9_.\-@+]|\\ )+`;
// The same segment carrying *unescaped* interior spaces. Only ever used where
// a separator follows, which is what proves the space was interior to the
// path rather than the end of it.
//
// Bare matches take **one** such space (`Global Navigation/`), not any number:
// a greedy walk across several spaces will happily cross a sentence to reach
// the next word that happens to be followed by a slash, and link
// `/a/b.md then src/foo.ts` as one path. One space is the common real case
// (`Program Files\`, `Blog Posts/`) and it cannot reach past the word after
// it. Anything longer is for the filesystem to confirm on hover (RFC 0066) —
// and it must be, because verification can only *extend* a span, never shrink
// one the regex over-read.
const SPACED_SEG_1 = String.raw`${SEG}(?: ${SEG})?`;
// Inside a delimiter pair there is a terminator, so any number of spaces is
// safe — the match cannot run past its own closing bracket.
const SPACED_SEG = String.raw`${SEG}(?: ${SEG})*`;
/** `dirSeg` / `finalSeg` are the directory and trailing segment classes:
 *  one-space and space-free when bare, unbounded when a delimiter pair bounds
 *  the match. `chars` only feeds the bare relative form, which has no root to
 *  anchor a space-absorbing walk. */
function pathBody(chars: string, dirSeg: string, finalSeg: string): string {
  return String.raw`(?:${WIN_DRIVE}(?:${dirSeg}[\\/])*${finalSeg}|(?:~|\.{1,2})?\/(?:${dirSeg}\/)*${finalSeg}|\.?[A-Za-z0-9_\-@+]+\/${chars}*\.[A-Za-z0-9_\-@+]+|${BARE_FILENAME_3})`;
}
const LINE_COL_SUFFIX = String.raw`(?::\d+(?::\d+)?)?`;
const BARE = String.raw`(?<![A-Za-z0-9_.:/\\\-@+])${pathBody(PATH_CHARS, SPACED_SEG_1, SEG)}${LINE_COL_SUFFIX}`;

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
  return String.raw`(?<=${o})${pathBody(PATH_CHARS_SPACED, SPACED_SEG, SPACED_SEG)}${LINE_COL_SUFFIX}(?=${c})`;
}

const FILE_PATH_RE = new RegExp(
  [...DELIMITER_PAIRS.map(([o, c]) => delimited(o, c)), BARE].join("|"),
  "g",
);
const TRAILING_PUNCT_RE = /[.,;:)\]}>'"\\]+$/;

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
    out.push({
      kind,
      text: matchText,
      index: m.index,
      href: hrefFor(kind, matchText),
    });
  }
  return out;
}

function overlaps(a: ChatLinkSpan, b: ChatLinkSpan): boolean {
  return a.index < b.index + b.text.length && b.index < a.index + a.text.length;
}

/**
 * Spans a caller already knows are paths, located in `text` literally.
 *
 * These come from the protocol (`AgentToolCall.locations`) or from the call's
 * own input — the agent saying "this call is about *this* file" — so they
 * outrank anything the regular expressions below would read out of the same
 * characters. That is what makes a path with spaces exact rather than guessed.
 */
function knownSpans(
  text: string,
  knownPaths: readonly string[],
): ChatLinkSpan[] {
  const out: ChatLinkSpan[] = [];
  // Longest first: a location nested inside another (a directory and a file
  // under it) must not win the overlap against the longer one.
  for (const p of [...knownPaths].sort((a, b) => b.length - a.length)) {
    if (!p) continue;
    let from = 0;
    for (;;) {
      const index = text.indexOf(p, from);
      if (index < 0) break;
      const span: ChatLinkSpan = { kind: "path", text: p, index, href: p };
      if (!out.some((o) => overlaps(span, o))) out.push(span);
      from = index + p.length;
    }
  }
  return out;
}

/**
 * URL and file-path spans in `text`.
 *
 * Precedence, highest first: `knownPaths` (exact, from the protocol), then
 * URLs (so a path inside a URL is not also linked), then the path regexes.
 */
export function matchChatLinks(
  text: string,
  knownPaths?: readonly string[],
): ChatLinkSpan[] {
  const known = knownPaths?.length ? knownSpans(text, knownPaths) : [];
  const urls = collect(text, URL_RE, "url", TRAILING_URL_PUNCT_RE).filter(
    (u) => !known.some((k) => overlaps(u, k)),
  );
  const paths = collect(text, FILE_PATH_RE, "path", TRAILING_PUNCT_RE).filter(
    (p) => ![...urls, ...known].some((o) => overlaps(p, o)),
  );
  return [...known, ...urls, ...paths].sort((a, b) => a.index - b.index);
}

/** The path a span opens: `\ ` escapes collapsed, `file://` URLs decoded. */
function hrefFor(kind: ChatLinkKind, text: string): string {
  if (kind === "url") return text;
  return text.replace(/\\ /g, " ");
}

/**
 * The local path a `file:` URL names, or `undefined` for any other URL.
 * `file:///Users/me/Blog%20Posts/a.md` is a path the editor can open — routing
 * it to the OS instead would hand the file to another application.
 */
export function filePathFromUrl(href: string): string | undefined {
  if (!/^file:\/\//i.test(href)) return undefined;
  try {
    return decodeURIComponent(new URL(href).pathname);
  } catch {
    return undefined;
  }
}

/** `http(s):` / `file:` are URLs; everything else is a path (markdown `[x](src/a.ts)`). */
export function kindFromHref(href: string): ChatLinkKind {
  return /^(https?:|file:)/i.test(href) ? "url" : "path";
}

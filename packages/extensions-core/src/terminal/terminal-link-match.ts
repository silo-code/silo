// Pure path-span detection for terminal output. Kept free of host/xterm
// imports so unit tests can exercise it without pulling monaco.

// Three alternatives:
//   1. Windows drive-absolute paths — `C:\Users\me\file.txt`, or with
//      forward slashes (`C:/Users/me`), which Windows accepts too.
//   2. Explicit-prefix paths — `~/...`, `/abs/...`, `./rel/...`, `../rel/...`.
//   3. Bare relative paths — `word/word/.../file.ext`, including hidden
//      directory prefixes like `.playwright-mcp/shot.png`. The trailing
//      `.ext` requirement keeps random `1/2` style noise out.
// Any form can carry an optional `:LINE` or `:LINE:COL` suffix.
// Trailing sentence punctuation is stripped after the match so
// `see /etc/hosts.` doesn't include the dot.
//
// Lookbehind excludes every char that can appear in a path segment so we
// never start a match mid-token (e.g. `playwright-mcp/x.png` must not also
// yield a second link at `mcp/x.png`). The backslash is in that set for the
// same reason: `$env:LOCALAPPDATA\silo.exe` has no resolvable root, and
// linking the trailing `silo.exe` out of it would hand the editor a path
// that was never meant to stand alone.
//
// Only a *rooted* Windows path matches. A bare `dir\file.ts` is left alone
// because a lone backslash is far more often an escape (`\n`, `\d+`, a
// shell line-continuation) than a separator, and there is no `C:` to tell
// the two apart.
//
// A *directory* segment may contain single interior spaces (`~/Blog
// Posts/Shift.md`): the space is only absorbed when the segment it belongs
// to is immediately followed by a separator, which is what proves the space
// was interior to the path rather than the end of it. The final segment
// stays space-free in this "bare" form — with no terminator to stop it, a
// space-inclusive last segment would run past the path and swallow trailing
// prose (any later `word.word` on the line would get treated as the
// "extension" a greedy match backtracks onto). So an undelimited
// `~/My Notes/Trip Notes.md` still links only `~/My Notes/Trip`; bounding it
// in a delimiter pair is what lifts the restriction on the last segment too.
const PATH_CHARS = String.raw`[A-Za-z0-9_./\-@+]`;
// Windows segments are separated by `\`, but `C:/Users/me` is equally valid,
// so both separators are in play once a drive letter has rooted the path.
const WIN_DRIVE = String.raw`[A-Za-z]:[\\/]`;
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
  return String.raw`(?:${WIN_DRIVE}(?:${dirSeg}[\\/])*${finalSeg}|(?:~|\.{1,2})?\/(?:${dirSeg}\/)*${finalSeg}|\.?[A-Za-z0-9_\-@+]+\/${chars}*\.[A-Za-z0-9_\-@+]+)`;
}
const LINE_COL_SUFFIX = String.raw`(?::\d+(?::\d+)?)?`;
const BARE = String.raw`(?<![A-Za-z0-9_.:/\\\-@+])${pathBody(PATH_CHARS, SPACED_SEG_1, SEG)}${LINE_COL_SUFFIX}`;

// Paths that carry spaces (e.g. `~/Blog Posts/My Doc.md`) only get matched
// when explicitly bounded by a delimiter pair — `(...)`, `[...]`, `"..."`,
// `'...'` — which is how tool output/quoted shells actually present them.
// The lookbehind/lookahead anchor to the delimiter chars themselves (not
// consumed by the match), and since none of those delimiter chars are in
// the space-inclusive class, a greedy match still can't run past its own
// closing delimiter into unrelated text.
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

export const FILE_PATH_RE = new RegExp(
  [...DELIMITER_PAIRS.map(([o, c]) => delimited(o, c)), BARE].join("|"),
  "g",
);
// A trailing backslash is punctuation too: `C:\Users\` at the end of a
// sentence should link the directory, not the dangling separator.
const TRAILING_PUNCT_RE = /[.,;:)\]}>'"\\]+$/;

/** One matched span: the characters it covers, where, and what it opens —
 *  which differ when the written form escapes its spaces (RFC 0066). */
export interface FilePathSpan {
  readonly text: string;
  readonly index: number;
  readonly href: string;
}

/** Find path-like spans in a terminal line. */
export function matchFilePaths(text: string): FilePathSpan[] {
  const out: FilePathSpan[] = [];
  FILE_PATH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FILE_PATH_RE.exec(text)) !== null) {
    let matchText = m[0];
    const trailing = matchText.match(TRAILING_PUNCT_RE);
    if (trailing) matchText = matchText.slice(0, -trailing[0].length);
    if (!matchText) continue;
    out.push({
      text: matchText,
      index: m.index,
      href: matchText.replace(/\\ /g, " "),
    });
  }
  return out;
}

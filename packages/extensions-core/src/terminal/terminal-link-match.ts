// Pure path-span detection for terminal output. Kept free of host/xterm
// imports so unit tests can exercise it without pulling monaco.

// Two alternatives:
//   1. Explicit-prefix paths — `~/...`, `/abs/...`, `./rel/...`, `../rel/...`.
//   2. Bare relative paths — `word/word/.../file.ext`, including hidden
//      directory prefixes like `.playwright-mcp/shot.png`. The trailing
//      `.ext` requirement keeps random `1/2` style noise out.
// Either form can carry an optional `:LINE` or `:LINE:COL` suffix.
// Trailing sentence punctuation is stripped after the match so
// `see /etc/hosts.` doesn't include the dot.
//
// Lookbehind excludes every char that can appear in a path segment so we
// never start a match mid-token (e.g. `playwright-mcp/x.png` must not also
// yield a second link at `mcp/x.png`).
//
// Path segments never contain a literal space in this "bare" form — without
// an explicit terminator, a space-inclusive class would run past the path
// and swallow trailing prose (e.g. any later `word.word` in the same line
// would get treated as the "extension" a greedy match backtracks onto).
const PATH_CHARS = String.raw`[A-Za-z0-9_./\-@+]`;
function pathBody(chars: string): string {
  return String.raw`(?:(?:~|\.{1,2})?\/${chars}+|\.?[A-Za-z0-9_\-@+]+\/${chars}*\.[A-Za-z0-9_\-@+]+)`;
}
const LINE_COL_SUFFIX = String.raw`(?::\d+(?::\d+)?)?`;
const BARE = String.raw`(?<![A-Za-z0-9_.:/\-@+])${pathBody(PATH_CHARS)}${LINE_COL_SUFFIX}`;

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
  return String.raw`(?<=${o})${pathBody(PATH_CHARS_SPACED)}${LINE_COL_SUFFIX}(?=${c})`;
}

export const FILE_PATH_RE = new RegExp(
  [...DELIMITER_PAIRS.map(([o, c]) => delimited(o, c)), BARE].join("|"),
  "g",
);
const TRAILING_PUNCT_RE = /[.,;:)\]}>'"]+$/;

/** Find path-like spans in a terminal line (text + start index). */
export function matchFilePaths(
  text: string,
): Array<{ text: string; index: number }> {
  const out: Array<{ text: string; index: number }> = [];
  FILE_PATH_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = FILE_PATH_RE.exec(text)) !== null) {
    let matchText = m[0];
    const trailing = matchText.match(TRAILING_PUNCT_RE);
    if (trailing) matchText = matchText.slice(0, -trailing[0].length);
    if (!matchText) continue;
    out.push({ text: matchText, index: m.index });
  }
  return out;
}

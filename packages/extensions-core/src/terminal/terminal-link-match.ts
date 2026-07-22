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
export const FILE_PATH_RE =
  /(?<![A-Za-z0-9_.:/\-@+])(?:(?:~|\.{1,2})?\/[A-Za-z0-9_./\-@+]+|\.?[A-Za-z0-9_\-@+]+\/[A-Za-z0-9_./\-@+]*\.[A-Za-z0-9_\-@+]+)(?::\d+(?::\d+)?)?/g;
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

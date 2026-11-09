/**
 * The candidate ladder for a path span that might continue past a space
 * (RFC 0066).
 *
 * Text alone cannot say where `/a/b/My File.md and then prose` ends — the
 * space is either inside the filename or the end of the path, and both
 * readings are valid English. So this module stops guessing and instead
 * proposes every reading, longest first, for a caller that can ask the
 * filesystem which one exists.
 *
 * Mirrored in `packages/extensions-core/src/terminal/terminal-link-candidates.ts`
 * for the terminal, which cannot import a `silo.*` package. Keep the rules the
 * same so a path that resolves in one resolves in the other.
 */

import type { ChatLinkSpan } from "./link-match";

/** Same set `link-match` strips off a bare match — a path at the end of a
 *  sentence must not carry the sentence with it. */
const TRAILING_PUNCT_RE = /[.,;:)\]}>'"\\]+$/;

/** Words of trailing text a ladder will reach across. */
export const MAX_LADDER_WORDS = 10;
/** Hard cap on probes a single span can cost. */
export const MAX_LADDER_CANDIDATES = 12;

/**
 * Readings of `span` within `line`, longest first, starting with the span
 * itself extended by as many following words as the caps allow and ending
 * with the span's own text.
 *
 * A **single-element result means "not ambiguous"** — the span is not followed
 * by a space, so there is nothing to verify and the caller should skip the
 * filesystem entirely. That check is the one keeping hover cost at zero for
 * the overwhelmingly common space-free path.
 */
export function pathCandidates(
  line: string,
  span: Pick<ChatLinkSpan, "text" | "index">,
): string[] {
  const rest = line.slice(span.index + span.text.length);
  const extensions: string[] = [];
  let taken = span.text;
  let cursor = 0;
  while (extensions.length < MAX_LADDER_WORDS) {
    // Exactly one space, then at least one non-space character: two spaces in
    // a row end a path as surely as a newline does (column-aligned tool
    // output), and so does a trailing space at the end of the line.
    if (rest[cursor] !== " ") break;
    const next = rest.slice(cursor + 1);
    const word = /^[^\s]+/.exec(next)?.[0];
    if (!word) break;
    taken = `${taken} ${word}`;
    // The reading is the words without the sentence punctuation that happens
    // to follow them; the walk itself continues from the unstripped position.
    extensions.push(taken.replace(TRAILING_PUNCT_RE, ""));
    cursor += 1 + word.length;
  }
  // Longest first — the whole point is to prefer the longest reading that is
  // real, so a filename with two spaces in it beats the prefix with one.
  const ladder = [...extensions.reverse(), span.text];
  return ladder.slice(Math.max(0, ladder.length - MAX_LADDER_CANDIDATES));
}

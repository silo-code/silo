/**
 * Collapsing a long user prompt in the transcript.
 *
 * A pasted log, a spec, a stack trace — a prompt can run hundreds of lines,
 * and left whole it pushes the answer it asked for off screen and makes
 * scrolling back through a session hard work. A long one is clipped to
 * {@link PROMPT_COLLAPSE_MAX_LINES} with a **Show more** / **Show less**
 * toggle under it, the way Claude Desktop handles the same problem.
 *
 * Whether a given prompt is long enough can only be settled by the DOM — the
 * same text is two lines wide and twenty narrow — so the component measures.
 * What's decided here is everything around that measurement: which prompts are
 * even worth measuring, and when a measurement counts as "there is more to
 * show". Pure, so it tests without a DOM — the same split `prompt-rail.ts`
 * makes.
 */

/**
 * How many lines of a prompt stay visible while collapsed.
 *
 * Enough that a short-but-not-tiny prompt is never clipped and most clipped
 * ones still show what they were about, short enough that the agent's reply
 * stays in view beneath it.
 *
 * The visible height this implies lives in `acp-chat.css`
 * (`.acp-chat__message-clip[data-clip]`) and must be kept in step with it;
 * it's an `em` multiple of the same line height, so the clip scales with
 * `uiFontSize` rather than pinning a pixel height.
 */
export const PROMPT_COLLAPSE_MAX_LINES = 12;

/**
 * The narrowest bubble worth planning for, in characters per line — a chat
 * panel docked to a sliver, where even fairly short text wraps a lot.
 *
 * Deliberately pessimistic: it only feeds {@link promptMayOverflow}, and the
 * cost of guessing too low is one measurement that finds nothing, while
 * guessing too high would leave a genuinely long prompt un-collapsed.
 */
const MIN_CHARS_PER_LINE = 16;

/** Below this many characters, no bubble width can reach the clip. */
export const PROMPT_COLLAPSE_CANDIDATE_CHARS =
  PROMPT_COLLAPSE_MAX_LINES * MIN_CHARS_PER_LINE;

/**
 * Sub-pixel slack, in px. Fractional layout means a content box that fits
 * exactly can still measure a hair taller than its clip; without the slack
 * that reads as "there is more to show" and offers a **Show more** that
 * reveals nothing.
 */
const HEIGHT_SLACK_PX = 2;

/**
 * Is this prompt worth measuring at all?
 *
 * Measuring means a `ResizeObserver` per prompt, and a long session has
 * hundreds of them — so the obviously-short ones are filtered out by text
 * alone, before any of that is wired up. A `true` here is only a
 * *candidate*: {@link promptIsClipped} still decides from real geometry.
 *
 * @param text - The prompt as the user typed it.
 * @param attachmentCount - How many attachment chips ride under it. Any at
 * all makes the prompt a candidate: chips wrap, and a prompt of one line and
 * forty files would otherwise be clipped with no way to open it.
 */
export function promptMayOverflow(text: string, attachmentCount = 0): boolean {
  if (attachmentCount > 0) return true;
  if (text.length >= PROMPT_COLLAPSE_CANDIDATE_CHARS) return true;
  let lines = 1;
  for (const ch of text) {
    if (ch === "\n" && ++lines > PROMPT_COLLAPSE_MAX_LINES) return true;
  }
  return false;
}

/**
 * Did the clip actually hide something?
 *
 * Both heights come from the collapsed bubble: `contentHeight` is the
 * prompt's natural height, `clipHeight` what the clip is letting through.
 */
export function promptIsClipped(
  contentHeight: number,
  clipHeight: number,
): boolean {
  return contentHeight > clipHeight + HEIGHT_SLACK_PX;
}

/** The toggle's label, which is also its accessible name. */
export function promptToggleLabel(expanded: boolean): string {
  return expanded ? "Show less" : "Show more";
}

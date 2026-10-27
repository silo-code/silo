/**
 * The Prompt Rail — a column of thin dashes down the transcript's right edge,
 * one per user prompt, for jumping back to an earlier question.
 *
 * Geometry and text live here rather than in the component so they can be
 * tested without a DOM, the same split `scroll.ts` makes.
 */

import type { Turn } from "./transcript-model";

/** Below this, scrolling is trivial and the rail would be decoration. */
export const PROMPT_RAIL_MIN_PROMPTS = 3;

/** Resting gap between dash centres, before any compression to fit. */
export const PROMPT_RAIL_PITCH_PX = 10;

/** How many dashes either side of the hovered one react to it. */
export const PROMPT_RAIL_FOCUS_SPAN = 3;

/** How much of a prompt the preview card shows. */
export const PROMPT_RAIL_PREVIEW_CHARS = 280;

/** How far the first dash sits from the top of the transcript. */
export const PROMPT_RAIL_TOP_INSET_PX = 10;

/** How far the preview card stays from the transcript's top and bottom. */
export const PROMPT_RAIL_PREVIEW_MARGIN_PX = 8;

/** Breathing room above a prompt the rail has just scrolled to. */
export const PROMPT_SCROLL_MARGIN_PX = 12;

/** One dash on the rail. */
export interface PromptTick {
  /**
   * The user `MessageEntry`'s own key, which is what survives a re-render.
   * Deliberately not `Turn.key`, which is positional (`t0`, `t1`, …) and
   * shifts whenever entries are filtered differently.
   */
  readonly key: string;
  readonly text: string;
  readonly index: number;
}

/** Where a tick stack sits in the rail. */
export interface TickLayout {
  readonly pitchPx: number;
  /** Rail-relative y of the first tick. */
  readonly topPx: number;
}

/** One tick per turn that opened with a user message, in transcript order. */
export function promptTicks(turns: readonly Turn[]): readonly PromptTick[] {
  const ticks: PromptTick[] = [];
  for (const turn of turns) {
    const user = turn.user;
    if (!user || user.text.trim().length === 0) continue;
    ticks.push({ key: user.key, text: user.text, index: ticks.length });
  }
  return ticks;
}

/**
 * The stack hangs from the top of the transcript at a fixed pitch, so the
 * first prompt is always in the same place and the rail grows downwards as
 * the conversation does — the reading order of the transcript itself. Once
 * the stack would reach the bottom, the pitch compresses instead; the rail
 * always shows every prompt, it just gets denser.
 */
export function tickLayout(input: {
  readonly count: number;
  readonly availablePx: number;
  readonly pitchPx?: number;
  readonly insetPx?: number;
}): TickLayout {
  const nominal = input.pitchPx ?? PROMPT_RAIL_PITCH_PX;
  const inset = input.insetPx ?? PROMPT_RAIL_TOP_INSET_PX;
  const available = Math.max(0, input.availablePx);
  // A rail shorter than two insets has no room to hang anything in; clamping
  // the top keeps the stack inside it rather than below it.
  const topPx = Math.min(inset, available);
  if (input.count <= 1) return { pitchPx: nominal, topPx };

  const span = Math.max(0, available - inset * 2);
  return { pitchPx: Math.min(nominal, span / (input.count - 1)), topPx };
}

/**
 * The tick nearest a rail-relative `y`, or `null` when the pointer is outside
 * the stack. Half a pitch of slack at each end so the first and last dashes
 * are no harder to hit than the ones in the middle.
 */
export function tickAtY(input: {
  readonly y: number;
  readonly count: number;
  readonly pitchPx: number;
  readonly topPx: number;
}): number | null {
  if (input.count <= 0) return null;
  const slack = input.pitchPx / 2;
  const first = input.topPx - slack;
  const last = input.topPx + input.pitchPx * (input.count - 1) + slack;
  if (input.y < first || input.y > last) return null;
  const raw = Math.round((input.y - input.topPx) / input.pitchPx);
  return Math.min(input.count - 1, Math.max(0, raw));
}

/**
 * Fisheye falloff — 1 under the cursor, tapering to 0 at the edge of the
 * focus span. With no hovered tick every dash scores 0, which is the resting
 * form, so the component needs no separate idle branch.
 */
export function tickEmphasis(
  index: number,
  hovered: number | null,
  span: number = PROMPT_RAIL_FOCUS_SPAN,
): number {
  if (hovered === null) return 0;
  const d = Math.abs(index - hovered);
  if (d > span) return 0;
  return 1 - d / (span + 1);
}

/**
 * The leading words of a prompt. Cut at a word boundary when there is one
 * within reach, so the preview doesn't end mid-word; a single long run of
 * characters is cut where it falls.
 */
export function previewText(
  text: string,
  maxChars: number = PROMPT_RAIL_PREVIEW_CHARS,
): string {
  const collapsed = text.trim().replace(/\s+/g, " ");
  if (collapsed.length <= maxChars) return collapsed;
  const cut = collapsed.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > maxChars / 2 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Where the preview card sits so it tracks the cursor without ever running
 * off the top or bottom of the transcript. Centred on the cursor, then
 * clamped; a card taller than the area it must fit in is pinned to the top.
 */
export function previewTop(input: {
  readonly cursorY: number;
  readonly cardHeightPx: number;
  readonly boundsHeightPx: number;
  readonly marginPx?: number;
}): number {
  const margin = input.marginPx ?? PROMPT_RAIL_PREVIEW_MARGIN_PX;
  const max = input.boundsHeightPx - input.cardHeightPx - margin;
  if (max <= margin) return margin;
  return Math.min(
    max,
    Math.max(margin, input.cursorY - input.cardHeightPx / 2),
  );
}

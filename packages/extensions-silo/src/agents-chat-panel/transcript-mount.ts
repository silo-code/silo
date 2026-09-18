/**
 * How much of a Chat transcript is in the DOM (RFC 0050).
 *
 * Three states, and the panel moves between them without ever unmounting:
 *
 * - **all** — every turn rendered. What a freshly opened panel does.
 * - **dropped** — no rows at all. Entered after the panel has been off screen
 *   for {@link TRANSCRIPT_IDLE_DROP_MS}, so an idle workspace stops inflating
 *   the document's render tree.
 * - **tail** — the last {@link TRANSCRIPT_TAIL_TURNS} turns, with a spacer
 *   standing in for everything above them. What the panel returns to when it
 *   comes back on screen after a drop. Scrolling up past the spacer reveals
 *   the head and returns to **all**.
 *
 * The rules live here rather than in `AcpChatPanel` because each was arrived
 * at by measurement and each is a regression waiting to happen:
 *
 * - Dropping rows the moment a panel leaves screen costs ~1.4 s of main thread
 *   to rebuild on return (14,826-node transcript) against ~0.44 s for leaving
 *   them mounted. Hence the grace period.
 * - Rebuilding the *whole* transcript on return is what the tail state avoids:
 *   a real 30k-node transcript costs ~2.5 s, and the user only ever sees the
 *   bottom of it.
 * - Deciding what is mounted from state updated in an effect flashes, because
 *   effects run after paint. Hence these being pure derivations the caller
 *   evaluates during render.
 */

/**
 * How long a Chat panel keeps its transcript rows after leaving screen. Long
 * enough that switching away and back is free; short enough that workspaces
 * left idle stop inflating the document's render tree.
 */
export const TRANSCRIPT_IDLE_DROP_MS = 30_000;

/**
 * How many recent turns come back when a dropped panel returns to screen.
 * Enough to fill a tall window, since the point is that the user sees content
 * immediately; the rest is a spacer until they scroll up.
 */
export const TRANSCRIPT_TAIL_TURNS = 4;

/**
 * How long to wait before measuring the head's height. Debounces a streaming
 * transcript, which changes many times a second and would otherwise force a
 * layout read on each change.
 */
export const HEAD_MEASURE_DEBOUNCE_MS = 400;

/** How close to the top of the scroller counts as "scrolled into the spacer". */
export const HEAD_REVEAL_MARGIN_PX = 200;

/**
 * How long after returning to screen to re-check whether the restored position
 * lands inside the spacer, for the case where the restore had no scrolling to
 * do and so fired no scroll event.
 */
export const HEAD_REVEAL_SETTLE_MS = 700;

/** What the transcript renders this pass. */
export type TranscriptWindow =
  /** Every turn. */
  | { readonly kind: "all" }
  /** Nothing — the panel is off screen and past its grace period. */
  | { readonly kind: "dropped" }
  /** Turns from `from` onwards, preceded by a `spacerPx`-tall spacer. */
  | {
      readonly kind: "tail";
      readonly from: number;
      readonly spacerPx: number;
    };

/**
 * What belongs in the DOM this render.
 *
 * `onScreen` beats `idleDropped` unconditionally — deriving this during render
 * is what stops the panel painting one empty frame before an effect can put
 * the rows back.
 *
 * The tail state needs a believable spacer height. Without one (never measured,
 * or measured while the panel was hidden and came back zero) the honest answer
 * is to render everything: a wrong spacer height moves the user's scroll
 * position, which is worse than a slow switch.
 */
export function transcriptWindow(input: {
  readonly onScreen: boolean;
  readonly idleDropped: boolean;
  readonly headRevealed: boolean;
  readonly turnCount: number;
  readonly spacerPx: number | null;
  readonly tailTurns?: number;
}): TranscriptWindow {
  if (!input.onScreen && input.idleDropped) return { kind: "dropped" };
  if (input.headRevealed) return { kind: "all" };

  const tail = input.tailTurns ?? TRANSCRIPT_TAIL_TURNS;
  const from = input.turnCount - tail;
  if (from <= 0) return { kind: "all" };
  if (input.spacerPx === null || input.spacerPx <= 0) return { kind: "all" };

  return { kind: "tail", from, spacerPx: input.spacerPx };
}

/** What the grace-period timer should do for the current `onScreen` value. */
export type IdleDropPlan =
  | { readonly kind: "cancel" }
  | { readonly kind: "schedule"; readonly delayMs: number };

/**
 * On screen, any pending drop is cancelled. Off screen, a drop is scheduled
 * `idleMs` out — restarted from zero on each transition, so a panel the user
 * keeps returning to never reaches it.
 */
export function planIdleDrop(input: {
  readonly onScreen: boolean;
  readonly idleMs?: number;
}): IdleDropPlan {
  if (input.onScreen) return { kind: "cancel" };
  return {
    kind: "schedule",
    delayMs: input.idleMs ?? TRANSCRIPT_IDLE_DROP_MS,
  };
}

/**
 * The spacer's height, given the measured span from the top of the first turn
 * to the top of the first tail turn.
 *
 * The scroller is a `gap`-separated flex column, so the spacer is itself a flex
 * item and earns one gap of its own. Subtracting one gap from the span is what
 * keeps total height — and therefore `scrollTop` — unchanged across the swap.
 */
export function spacerHeightPx(input: {
  readonly headSpanPx: number;
  readonly rowGapPx: number;
}): number {
  return Math.max(0, Math.round(input.headSpanPx - input.rowGapPx));
}

/**
 * Whether the viewport has reached the spacer and the real head must be
 * rendered.
 *
 * The spacer occupies `[0, spacerPx]`, so any `scrollTop` below that puts the
 * user inside it — looking at blank space where the head should be. This is
 * not only a scrolled-up case: restoring a position from before the drop lands
 * there directly, which is why the check compares against the spacer rather
 * than against the top of the scroller.
 *
 * Deliberately generous by one margin, so scrolling up fills the head in
 * before blank space comes into view rather than after.
 */
export function shouldRevealHead(input: {
  readonly scrollTop: number;
  readonly spacerPx: number;
  readonly marginPx?: number;
}): boolean {
  return (
    input.scrollTop <=
    input.spacerPx + (input.marginPx ?? HEAD_REVEAL_MARGIN_PX)
  );
}

/**
 * How far to nudge `scrollTop` after the head is revealed.
 *
 * The spacer stood in for the head's height; the real head is rarely exactly
 * that tall. Shifting by the difference keeps whatever the user was reading in
 * the same place on screen instead of jumping by the error.
 */
export function revealScrollAdjustment(input: {
  readonly scrollHeightBefore: number;
  readonly scrollHeightAfter: number;
}): number {
  return input.scrollHeightAfter - input.scrollHeightBefore;
}

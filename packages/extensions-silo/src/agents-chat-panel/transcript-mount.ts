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
 * How long a Chat panel keeps its transcript rows after leaving screen.
 *
 * Was 30 s, chosen when returning meant rebuilding the whole transcript
 * (~1.4 s) and a grace period was the only thing making a quick switch-and-back
 * free. The tail window made a return cost ~0.2 s instead, so the grace no
 * longer earns its keep — and it had a real cost, because for its whole
 * duration the workspace you just left still inflates the document and makes
 * every *other* switch slower.
 *
 * Not zero: `onScreen` can flicker during a switch, and dropping on a transient
 * false would churn. Half a second is long enough to ride that out and short
 * enough that nothing feels sticky.
 */
export const TRANSCRIPT_IDLE_DROP_MS = 500;

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
  /**
   * Index of the first turn still rendered, **frozen when the head was
   * dropped** — not re-derived from the current turn count. A streaming
   * transcript keeps appending turns, and re-deriving would march the boundary
   * forward, pushing turns out of the tail that the spacer was never measured
   * to cover. Content height would shrink under the user and the scroll would
   * jump. Freezing it means new turns simply grow the tail until the next drop.
   *
   * `null` once the head has been revealed, or before any drop.
   */
  readonly droppedFrom: number | null;
  readonly spacerPx: number | null;
}): TranscriptWindow {
  const canTail =
    input.droppedFrom !== null &&
    input.droppedFrom > 0 &&
    input.spacerPx !== null &&
    input.spacerPx > 0;

  // Off screen and past the grace period: the tail if we can, nothing if we
  // cannot. Holding the tail rather than dropping to nothing is what makes a
  // return free — there is no rebuild, because what the user will see is
  // already rendered. A tail is a few thousand nodes against the ~15,000 a
  // whole transcript costs, so N warmed workspaces stay cheap either way.
  if (!input.onScreen && input.idleDropped) {
    return canTail
      ? { kind: "tail", from: input.droppedFrom!, spacerPx: input.spacerPx! }
      : { kind: "dropped" };
  }
  if (!canTail) return { kind: "all" };

  return { kind: "tail", from: input.droppedFrom!, spacerPx: input.spacerPx! };
}

/**
 * Where the head ends and the tail begins, chosen at the moment of the drop.
 * Returns `null` when the transcript is too short to be worth splitting.
 */
export function headBoundary(input: {
  readonly turnCount: number;
  readonly tailTurns?: number;
}): number | null {
  const from = input.turnCount - (input.tailTurns ?? TRANSCRIPT_TAIL_TURNS);
  return from > 0 ? from : null;
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

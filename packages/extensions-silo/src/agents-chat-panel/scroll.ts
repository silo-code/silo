/**
 * Transcript scroll persistence for the Chat panel — kept pure so the restore
 * and store-selection rules are unit-tested without a DOM.
 *
 * Restoring a transcript's position is not a one-shot `scrollTop =`. Two
 * things make it a process rather than an assignment, and `AcpChatPanel`'s
 * "transcript scroll" section has the full account:
 *
 * - The panel never remounts, so the restore has to be re-armed whenever the
 *   transcript comes back **on screen** (`DockPanelProps.onScreen`) — a
 *   deselected tab only has its element detached, which is what discards the
 *   `scrollTop`, and a backgrounded workspace not even that.
 * - A transcript can paint in several passes (the journal seed, then
 *   `connect()`'s own possibly-more-current copy, then whatever streams in),
 *   and any pass can leave the scroller shorter than the saved offset — which
 *   the browser silently **clamps**. So the restore is modelled as a *target*
 *   the panel re-applies every frame ({@link applyRestoreStep}) until it
 *   sticks, with saves suppressed until then: a clamped value reaching the
 *   save path overwrites the remembered one and loses the position for good.
 *
 * There is deliberately **no module-level cache here.** The live position is a
 * ref on the panel, which outlives every tab and workspace switch because the
 * panel does; the durable copy is `params.scrollTop` / `params.scrollPinned`
 * in the panel's own `DockPanelRecord` (RFC 0041), which is the sanctioned
 * per-dock-panel store and the only thing a genuine close-and-reopen or a
 * restart has to read.
 */

/** How close to the bottom still counts as "following the stream". */
export const AUTOSCROLL_THRESHOLD_PX = 24;

/** Debounce before persisting scroll into the panel's `DockPanelRecord`. */
export const SCROLL_SAVE_DEBOUNCE_MS = 300;

/**
 * How long the transcript must stop changing before a restore that never
 * reached its target is given up on. A conversation really can come back
 * shorter than it was saved at (a `/clear`, a compaction, a journal that
 * replayed fewer entries), and the target would otherwise block saves forever.
 */
export const SCROLL_RESTORE_SETTLE_MS = 1000;

/**
 * Hard ceiling on how long a restore may stay pending. The settle window alone
 * isn't enough of a bound: a transcript that never paints an entry (an agent
 * that fails to connect, a journal read that hangs) would keep the retry loop
 * alive for the life of the panel.
 */
export const SCROLL_RESTORE_TIMEOUT_MS = 5000;

/** A remembered position: the offset plus whether it was following the stream. */
export interface ScrollSnapshot {
  readonly top: number;
  readonly pinned: boolean;
}

/**
 * What a transcript coming into view owes the user — `"bottom"` follows the
 * stream (and is satisfied by the first frame), `"offset"` re-applies an exact
 * position and is only satisfied once the content is tall enough to hold it.
 */
export type ScrollTarget =
  | { readonly kind: "bottom" }
  | { readonly kind: "offset"; readonly top: number };

/**
 * Which conversation a remembered position belongs to. A profile switch or a
 * new session id starts a different conversation, and an offset measured
 * against the old one means nothing in it.
 */
export function transcriptScrollKey(
  profileId: string | undefined,
  sessionId: string | null | undefined,
): string {
  if (sessionId) return `session:${sessionId}`;
  if (profileId) return `profile:${profileId}:new`;
  return "anon";
}

export function isValidScrollTop(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function persistedScroll(
  profileId: string | undefined,
  paramSessionId: string | null | undefined,
  scrollTop: unknown,
  scrollPinned: unknown,
  scrollBucket: string,
): ScrollSnapshot | undefined {
  if (!isValidScrollTop(scrollTop)) return undefined;
  if (transcriptScrollKey(profileId, paramSessionId) !== scrollBucket) {
    return undefined;
  }
  return { top: scrollTop, pinned: scrollPinned === true };
}

/**
 * The target a newly-armed transcript should restore to. No remembered
 * position — a brand-new conversation — means follow the stream.
 *
 * A position that *was* at the bottom also restores as `"bottom"` rather than
 * as its old offset: the transcript keeps streaming while it is off screen, so
 * the absolute offset the bottom used to sit at is stale by the time the user
 * comes back, while "follow the stream" is still exactly what they asked for.
 */
export function restoreTargetFor(
  saved: ScrollSnapshot | undefined,
): ScrollTarget {
  if (!saved || saved.pinned) return { kind: "bottom" };
  return { kind: "offset", top: saved.top };
}

/**
 * Whether a still-pending restore should be given up on, handing control back
 * to the user at whatever offset the browser clamped to. The target is worth
 * retrying for as long as the transcript is still changing shape, because each
 * change is a chance for it to grow tall enough to hold the offset.
 *
 * @param now — `Date.now()`.
 * @param armedAt — when this restore was armed.
 * @param lastChangeAt — when the transcript last changed.
 * @param hasEntries — whether the transcript has painted anything at all. An
 * empty one is still loading, so its quiet window means nothing.
 */
export function shouldAbandonRestore(
  now: number,
  armedAt: number,
  lastChangeAt: number,
  hasEntries: boolean,
): boolean {
  if (now - armedAt >= SCROLL_RESTORE_TIMEOUT_MS) return true;
  return hasEntries && now - lastChangeAt >= SCROLL_RESTORE_SETTLE_MS;
}

/** The largest `scrollTop` the scroller can currently hold. */
export function maxScrollTop(el: HTMLElement): number {
  return Math.max(0, el.scrollHeight - el.clientHeight);
}

/** Whether the scroller is within {@link AUTOSCROLL_THRESHOLD_PX} of the bottom. */
export function isPinnedToBottom(el: HTMLElement): boolean {
  return isPinnedScrollTop(el, el.scrollTop);
}

/** Whether `scrollTop` is within {@link AUTOSCROLL_THRESHOLD_PX} of the bottom. */
export function isPinnedScrollTop(el: HTMLElement, scrollTop: number): boolean {
  return (
    el.scrollHeight - scrollTop - el.clientHeight < AUTOSCROLL_THRESHOLD_PX
  );
}

export function scrollToBottom(el: HTMLElement): void {
  el.scrollTop = el.scrollHeight;
}

/**
 * Whether the scroller's current offset is the browser **clamping** it rather
 * than the user having moved it. A transcript re-paint can momentarily shorten
 * the content — the journal seed and `connect()`'s own copy can key the same
 * turns differently, replacing every node — and the browser then pins
 * `scrollTop` to the new maximum. That arrives at the scroll handler looking
 * exactly like a deliberate jump, and recording it throws the position away.
 *
 * The signature is specific: the offset sits at a maximum that is *lower* than
 * where the transcript was last seen. A user scrolling inside a genuinely
 * shorter transcript only matches while they are at its very bottom, where the
 * saved offset would restore them anyway.
 */
export function isClampedScroll(
  el: HTMLElement,
  lastTop: number | undefined,
): boolean {
  if (lastTop === undefined) return false;
  const max = maxScrollTop(el);
  return max < lastTop && el.scrollTop >= max - 1;
}

/**
 * One attempt at `target`, run once per frame. Returns whether the target is
 * now satisfied and the panel can hand control back to the user; `false` means
 * the content is still too short and the caller should try again next paint.
 */
export function applyRestoreStep(
  el: HTMLElement,
  target: ScrollTarget,
): boolean {
  if (target.kind === "bottom") {
    scrollToBottom(el);
    return true;
  }
  if (!isValidScrollTop(target.top)) return true;
  // A short transcript clamps the assignment, which reads back as "not
  // reached" — deliberately, so the caller retries on the next paint. Telling
  // an unreachable offset apart from a not-yet-reachable one needs to know
  // whether the transcript is still growing, so that call is the caller's
  // settle timer, not this function's. Sub-pixel scroll offsets (fractional
  // device pixel ratios) make an exact compare unreliable; 1px is the slack.
  el.scrollTop = target.top;
  return el.scrollTop >= target.top - 1;
}

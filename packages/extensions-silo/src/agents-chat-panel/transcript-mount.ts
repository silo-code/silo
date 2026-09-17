/**
 * When a Chat panel keeps its transcript rows in the DOM (RFC 0050).
 *
 * The rules live here rather than in `AcpChatPanel` because both of them were
 * arrived at by measurement and each one is a regression waiting to happen:
 *
 * - Dropping rows the moment a panel leaves screen costs ~1.4 s of main thread
 *   to rebuild on return (14,826-node transcript), against ~0.44 s for leaving
 *   them mounted. Hence the grace period.
 * - Deciding "are rows mounted" from stored state updated in an effect flashes,
 *   because effects run after paint. Hence {@link transcriptRowsMounted} being
 *   a pure derivation callers evaluate during render.
 */

/**
 * How long a Chat panel keeps its transcript rows after leaving screen. Long
 * enough that switching away and back is free; short enough that workspaces
 * left idle stop inflating the document's render tree.
 */
export const TRANSCRIPT_IDLE_DROP_MS = 30_000;

/**
 * Whether the transcript's rows belong in the DOM this render.
 *
 * `onScreen` wins unconditionally — including when the idle timer has already
 * fired. That is not a detail: deriving this during render is what stops the
 * panel painting one empty frame before an effect can put the rows back.
 */
export function transcriptRowsMounted(input: {
  readonly onScreen: boolean;
  readonly idleDropped: boolean;
}): boolean {
  return input.onScreen || !input.idleDropped;
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

/**
 * The **kind-agnostic core** of agent activity (RFC 0038 Session 3.2): a turn
 * starts, a turn ends, and someone may or may not have been watching when it
 * did. That is the whole of what a Terminal session and a Chat session share,
 * and the attention rule in particular must exist in exactly one place — it
 * drifted once already, when the Chat path keyed attention on the active
 * *workspace* where the Terminal path keys it on the active *surface*, so a
 * Chat turn finishing in a background tab of the foreground workspace badged
 * nothing.
 *
 * Deliberately **not** the whole terminal reducer. Most of
 * `agent-activity-model.ts`'s vocabulary — `exited` vs. `process-gone`, shell
 * demotion, `source: shell | agent | timer`, blocked demotions — exists
 * because terminal detection is *ambiguous*: the host is inferring what a TUI
 * is doing from escape sequences. A Chat session is **told**. Dragging that
 * machinery across would be the opposite of unification; the terminal resolves
 * its ambiguity first and *then* calls in here, and Chat calls in directly on
 * turn start and turn end.
 */

import type { AgentActivity } from "@silo-code/sdk";

/**
 * The fields a turn owns. Both kinds carry these (a Terminal session inside
 * {@link AgentActivityState}, a Chat session on its registered
 * {@link AgentInfo}), and nothing in here touches anything else.
 */
export interface TurnPhase {
  readonly activity: AgentActivity;
  readonly needsAttention: boolean;
  readonly attentionSince: string | null;
  readonly workingSince: string | null;
}

/**
 * How a turn ended.
 *
 * - `"finished"` — it ran to completion. The only outcome that can raise
 *   attention, because it is the only one that means "there is something new
 *   here to read".
 * - `"cancelled"` — the user stopped it. They were plainly present, so
 *   flagging it for their attention would be absurd.
 * - `"failed"` — the agent errored or its process died. `activity: "error"` is
 *   already a loud, self-explanatory state that every consumer renders on its
 *   own; attention is left exactly as it was rather than stacking a second
 *   signal on top.
 */
export type TurnOutcome = "finished" | "cancelled" | "failed";

/**
 * A turn started: the agent is working, and whatever was pending before is
 * superseded — you are about to get a fresh finish, so an unread old one is no
 * longer worth flagging.
 */
export function beginTurn(prev: TurnPhase, now: string): TurnPhase {
  return {
    ...prev,
    activity: "working",
    needsAttention: false,
    attentionSince: null,
    workingSince: now,
  };
}

/**
 * A turn ended.
 *
 * **The one attention rule:** a finished turn wants attention when this is
 * really an agent and nobody witnessed the finish —
 *
 * ```ts
 * needsAttention = isAgent && !witnessed
 * ```
 *
 * `witnessed` is "was the user looking at this session's surface the instant
 * it finished" (`ctx.agents.getActive()` — a terminal tab or a Chat panel
 * tab, the host does not care which). Watching a finish live *is* seeing it;
 * no acknowledgment is owed for something you already saw. The clear side is
 * an explicit {@link witnessTurn}.
 *
 * Attention is only recomputed for a turn that was actually running
 * (`prev.activity === "working"`). An idle-from-idle signal — a repeated OSC
 * tick, a stray detector — must not resurrect or wipe a pending finish.
 */
export function endTurn(
  prev: TurnPhase,
  ev: {
    readonly now: string;
    readonly isAgent: boolean;
    readonly witnessed: boolean;
    readonly outcome: TurnOutcome;
  },
): TurnPhase {
  const activity: AgentActivity = ev.outcome === "failed" ? "error" : "idle";
  const wasWorking = prev.activity === "working";
  const raises = wasWorking && ev.outcome === "finished";
  const needsAttention = raises
    ? ev.isAgent && !ev.witnessed
    : prev.needsAttention;
  return {
    ...prev,
    activity,
    needsAttention,
    attentionSince: raises
      ? needsAttention
        ? ev.now
        : null
      : prev.attentionSince,
    workingSince: null,
  };
}

/**
 * Someone looked: clear the pending-finish flag. `ctx.agents.acknowledge` and
 * the terminal reducer's `"activated"` event are the same act. Returns `prev`
 * unchanged when nothing was pending, so callers can skip a notify.
 */
export function witnessTurn(prev: TurnPhase): TurnPhase {
  if (!prev.needsAttention) return prev;
  return { ...prev, needsAttention: false, attentionSince: null };
}

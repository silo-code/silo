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
  /**
   * When the last turn *ended* — the mirror of `workingSince`, and the only
   * one of these four that outlives being seen. `attentionSince` answers "is
   * there something unread here" and is cleared the moment someone looks;
   * this answers "how long ago did this stop", which looking at it does not
   * change. A settled session needs the second question answered and has
   * nothing left to answer it with, which is why this exists (RFC 0056).
   */
  readonly idleSince: string | null;
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
    // Running again, so "how long since it stopped" has no answer until it
    // stops again. `workingSince` is the live field for the whole of a turn.
    idleSince: null,
  };
}

/**
 * `idleSince` for a session that has just stopped — **the one implementation
 * of that rule**, for every path that stops a session (RFC 0056).
 *
 * {@link endTurn} calls it for a turn boundary; the terminal reducer calls it
 * for the three stops that are not turn boundaries at all (`dead`, `exited`,
 * `process-gone`). Those two used to spell the rule out separately, agreed at
 * first, and then silently diverged when only one of them grew the
 * first-observation clause below — leaving a terminal that was confirmed dead
 * without ever running a turn in this process with no duration at all. One
 * function now, so there is nothing left to drift.
 *
 * The rule, in two parts:
 *
 * - **It was running** → it stopped `now`.
 * - **It was already stopped** → keep the timestamp it had, or take `now` if
 *   it has none yet. Keeping it is what stops a repeated idle tick from
 *   walking a days-old finish forward; taking `now` is what gives a row an
 *   age at all when the session reached a stopped state without passing
 *   through `working` in this process — the normal case for a reattached
 *   terminal, whose scrollback replays as an idle prompt against a state
 *   machine starting at `"none"`.
 *
 * Better information always wins, because it is already in `prev` by the time
 * anything calls this: a persisted stamp, or {@link restoredIdleSince}'s
 * `lastLiveAt` estimate.
 */
export function stoppedIdleSince(
  prev: Pick<TurnPhase, "activity" | "idleSince">,
  now: string,
): string {
  return prev.activity === "working" ? now : (prev.idleSince ?? now);
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
 *
 * `idleSince` is not gated on `wasWorking` at all — it goes through
 * {@link stoppedIdleSince}, the shared rule every stopping path uses, and is
 * updated for **every** outcome: `cancelled` and `failed` mean the session
 * stopped just as much as `finished` does, which is all that field claims.
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
    idleSince: stoppedIdleSince(prev, ev.now),
  };
}

/**
 * `idleSince` for a session being restored from persistence — the one place
 * both kinds answer "when did this stop" for a turn whose end was never
 * observed.
 *
 * A precise `idleSince` always wins. Without one there are two cases, and
 * `stopped` is what separates them — whether the session comes back *not
 * working*, which a Terminal session decides from its persisted activity and
 * a Chat session is always (`restoredActivity` forces `idle`):
 *
 * - **Stopped** — either the app died mid-turn, or this record predates the
 *   field. Both mean the turn ended at some unobserved moment, and
 *   `lastLiveAt` — the last live detection signal, not a reconnect or a title
 *   refresh — is the honest lower bound. Without it a settled session shows
 *   no duration at all, which is how this landed the first time: every
 *   pre-existing row in the Agents navigator went blank, because no record
 *   written before the field existed carried one.
 * - **Still working** — `workingSince` is the live field; there is no idle
 *   duration to report until the turn actually ends.
 *
 * Self-healing: the first real turn end overwrites the estimate with the
 * exact stamp, and persists it.
 */
export function restoredIdleSince(args: {
  readonly stopped: boolean;
  readonly idleSince?: string | null;
  readonly lastLiveAt: string;
}): string | null {
  if (args.idleSince) return args.idleSince;
  return args.stopped ? args.lastLiveAt : null;
}

/**
 * Someone looked: clear the pending-finish flag. `ctx.agents.acknowledge` and
 * the terminal reducer's `"activated"` event are the same act. Returns `prev`
 * unchanged when nothing was pending, so callers can skip a notify.
 *
 * `idleSince` deliberately rides through untouched. Seeing a finish changes
 * whether it is unread, not when it happened — and a row that has just been
 * acknowledged is precisely the one that still needs its age (RFC 0056).
 */
export function witnessTurn(prev: TurnPhase): TurnPhase {
  if (!prev.needsAttention) return prev;
  return { ...prev, needsAttention: false, attentionSince: null };
}

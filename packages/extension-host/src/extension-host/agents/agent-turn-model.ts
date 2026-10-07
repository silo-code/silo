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
 * `idleSince` follows its own rule, in two parts (RFC 0056). It is stamped at
 * the working → stopped edge, and also the **first** time a session is seen
 * stopped at all without one — but never again after that. Both halves matter:
 *
 * - Re-stamping on an idle-from-idle tick (a repeated OSC signal, a stray
 *   detector) would walk the timestamp forward for a session that has not run
 *   in days, which is the exact failure this field was added to end.
 * - Only stamping at the edge leaves a session that reaches `idle` *without*
 *   passing through `working` in this process with no timestamp forever —
 *   and that is the common case on restore, not an edge case. A reattached
 *   terminal's OSC scrollback replays as an idle prompt against a state
 *   machine that starts at `"none"`, so the one transition it makes is
 *   `none → idle`, which is not an edge. Those rows rendered with no duration
 *   at all until this clause existed.
 *
 * So the first observation wins and then holds, which is also why a better
 * answer always beats it: a persisted stamp, or {@link restoredIdleSince}'s
 * `lastLiveAt` estimate, is already in `prev` by the time anything gets here.
 *
 * Unlike attention it is stamped for **every** outcome, `cancelled` and
 * `failed` included: all three mean the session stopped, which is all the
 * field claims.
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
    idleSince: wasWorking ? ev.now : (prev.idleSince ?? ev.now),
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

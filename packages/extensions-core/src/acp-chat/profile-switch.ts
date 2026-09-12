/**
 * Whether switching the composer's Agent Profile needs the user's consent
 * first — pure, so the rule is unit-tested rather than exercised only through
 * the component.
 *
 * Switching the profile is a **teardown**, not a prop change: the agent
 * process is reaped, the transcript is dropped, and a fresh session connects
 * (the two conversations have nothing in common — see `AcpChatPanel`'s connect
 * effect). That is the right behaviour and it is not what the control *looks*
 * like. A `Select` in a composer reads like a filter, so one click on it
 * silently discarding a conversation is a gesture whose cost is invisible.
 *
 * Two cases are worth stopping for, and nothing else is:
 *
 * - **A turn is in flight.** Cancelling someone's running turn from a dropdown
 *   is never what they meant, whatever else is on screen.
 * - **The conversation has something in it.** Judged on the agent's and the
 *   user's own words — Silo's own {@link NoticeEntry} lines don't count. A
 *   panel that only ever managed "ACP connection closed" holds nothing to
 *   mourn, and making the user confirm their way past a failed connect to try
 *   a different agent would be the opposite of helpful.
 */

import type { Transcript } from "./transcript-model";

/** A confirmation to put to the user, shaped for `ctx.ui.confirm`. */
export interface SwitchConfirm {
  readonly title: string;
  readonly body: string;
  readonly confirmLabel: string;
  readonly danger: true;
}

/** Does the transcript hold anything the user would lose? Silo's own notice
 *  lines are not conversation. */
export function hasConversation(transcript: Transcript): boolean {
  return transcript.entries.some((e) => e.type !== "notice");
}

/**
 * The confirmation to show before switching away from `currentLabel`, or
 * `null` when the switch costs nothing and should just happen.
 *
 * `currentLabel` names the agent being left rather than the one being picked:
 * what the user is about to lose is the more useful half, and it is the half
 * the dropdown no longer shows them once they have chosen.
 */
export function confirmProfileSwitch(
  transcript: Transcript,
  busy: boolean,
  currentLabel: string,
): SwitchConfirm | null {
  if (busy) {
    return {
      title: "Stop this turn and switch agents?",
      body: `${currentLabel} is still working. Switching agents stops it and starts a new conversation — this one cannot be brought back.`,
      confirmLabel: "Stop and switch",
      danger: true,
    };
  }
  if (hasConversation(transcript)) {
    return {
      title: "Switch agents and end this conversation?",
      body: `Switching starts a new conversation. This one with ${currentLabel} is closed and cannot be brought back — open another Agent Chat tab to keep it.`,
      confirmLabel: "Switch",
      danger: true,
    };
  }
  return null;
}

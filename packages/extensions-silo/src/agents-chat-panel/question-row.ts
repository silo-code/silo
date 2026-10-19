/**
 * How a settled question reads as a **row of history** (RFC 0062 follow-up).
 *
 * Pure, so the wording — which is the whole value of the row — is testable
 * without rendering the panel (`.agents/skills/silo-testing/SKILL.md`).
 */

import type { AgentElicitationResolution } from "@silo-code/sdk";
import type { QuestionEntry } from "./transcript-model";

/**
 * The line shown under a question that is no longer open, or `undefined` for
 * one that still is — a live ask has its interactive card instead, and a
 * caption there would just restate the buttons.
 *
 * `"interrupted"` is the one that has to *explain itself*: the user never saw
 * an answer go out and cannot send one now, because the request died with the
 * session that carried it. Saying so, and naming the one thing that does move
 * the conversation on, is the difference between a stranded turn and a clear
 * one.
 *
 * Deliberately not "Silo reloaded": a reload is only the **most common** way a
 * question is interrupted. `dispose()` writes the same resolution when the
 * panel closes, the profile switches, or the session resets — telling those
 * users the app reloaded would be plainly false. The wording states what is
 * true in every case (no reply reached the agent) and leaves the cause out.
 */
export function questionOutcome(
  resolution: AgentElicitationResolution | undefined,
): string | undefined {
  switch (resolution) {
    case "answered":
      return "You answered this.";
    case "skipped":
      return "You skipped this.";
    case "cancelled":
      return "You cancelled what the agent was doing when it asked.";
    case "interrupted":
      return "This was never answered — the agent never got a reply. Send a message to carry on.";
    default:
      return undefined;
  }
}

/**
 * Whether to draw this history row at all, given the questions that are
 * **live right now**.
 *
 * One question, one place on screen: while its request is open the panel
 * renders the interactive card, so the row for the same `elicitationId` stands
 * down. It takes over the moment the card retires — which is also the moment
 * the row gains the outcome that makes it worth reading.
 */
export function showQuestionRow(
  entry: QuestionEntry,
  liveIds: ReadonlySet<string>,
): boolean {
  return !liveIds.has(entry.elicitationId);
}

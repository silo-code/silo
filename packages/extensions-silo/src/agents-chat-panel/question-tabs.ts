/**
 * The **tabbed** presentation of an agent question (RFC 0062), and the one
 * rule that comes with it: a question you cannot see must still be able to
 * tell you whether it is answered.
 *
 * Tabs are Silo's choice, not the protocol's. The Agent Client Protocol sends
 * a flat `requestedSchema.properties` with no grouping or layout hint — each
 * property carries a short `title` (Claude's `AskUserQuestion` maps its
 * per-question `header` onto it) and that is all. Claude Code's own CLI reads
 * the same payload and draws one tab per question; stacking them, as Silo did
 * first, is equally faithful. Tabs win here because the Chat panel is narrow
 * and a three-question ask with described options is taller than it.
 *
 * Pure, so the labelling and answered-state rules are testable without
 * rendering the panel (`.agents/skills/silo-testing/SKILL.md`).
 */

import type {
  AgentElicitationAnswer,
  AgentElicitationQuestion,
} from "@silo-code/sdk";
import {
  isAnswered,
  setAnswerValue,
  setCustomAnswer,
  type QuestionFormState,
} from "./question-form";

/**
 * The radio value standing for "I'd rather type my own answer".
 *
 * A sentinel rather than a real option value, and deliberately one no agent
 * would send: it occupies the same selection slot as the options so that
 * choosing it visibly *deselects* them, which is exactly what it means — the
 * agent reads a non-empty custom answer **instead of** the selection.
 */
export const CUSTOM_OPTION_VALUE = "silo:custom-answer";

/** One tab: a question, its short label, and whether it is answered yet. */
export interface QuestionTab {
  readonly id: string;
  readonly label: string;
  readonly answered: boolean;
}

/**
 * The label for a question's tab.
 *
 * `title` is the agent's own short header ("Branch", "Tests") and is what
 * tabs are for. Falling back to the prompt would put a whole sentence in a
 * tab strip, so a question without one is numbered instead — position is the
 * only other thing the user can use to tell them apart.
 */
export function tabLabel(
  question: AgentElicitationQuestion,
  index: number,
): string {
  return question.title ?? `Question ${index + 1}`;
}

/**
 * The tab strip for an ask, in the agent's own question order.
 *
 * `answered` is the whole reason the strip carries state: with one question
 * visible at a time, "did I answer the other one?" is otherwise unanswerable
 * without clicking through — the cost tabs trade for their constant height.
 */
export function questionTabs(
  questions: readonly AgentElicitationQuestion[],
  form: QuestionFormState,
): readonly QuestionTab[] {
  return questions.map((question, index) => ({
    id: question.id,
    label: tabLabel(question, index),
    answered: isAnswered(form, question),
  }));
}

/**
 * Which tab to show, given the one the user picked.
 *
 * Falls back to the first question rather than showing an empty panel: the
 * remembered id can name a question that is no longer there (a replaced ask),
 * and an empty tab panel looks like a broken card rather than a recoverable
 * one.
 */
export function activeQuestion(
  questions: readonly AgentElicitationQuestion[],
  activeId: string,
): AgentElicitationQuestion | undefined {
  return questions.find((q) => q.id === activeId) ?? questions[0];
}

/**
 * Whether this question's free-text answer also appears as **an entry in the
 * option list**, so the selection can visibly sit on "I typed my own".
 *
 * Only for a question that has options: a `text` or `number` question already
 * *is* a free-text answer, so an "Other" entry beside it would be offering
 * the same thing twice. The box itself stays visible either way — typing in
 * it is what selects the entry (Dave's call: a box you have to reveal is a
 * box you have to find).
 */
export function customIsAnOption(question: AgentElicitationQuestion): boolean {
  return question.custom !== undefined && (question.options?.length ?? 0) > 0;
}

/**
 * Whether the free-text answer is the one currently **chosen** — the state the
 * "Other" entry renders as selected.
 *
 * Tracked explicitly rather than inferred from the box having text in it,
 * because the two came apart: typed text **survives** picking an option
 * instead (Dave's call — retyping an answer you already wrote is a worse sin
 * than leaving it on screen), so text is no longer evidence that it is the
 * answer the user means. What it is evidence of is only that they typed it
 * once. {@link effectiveAnswers} is where that distinction is paid out.
 */
export function isCustomChosen(
  chosen: ReadonlySet<string>,
  id: string,
): boolean {
  return chosen.has(id);
}

/**
 * The answers as the agent should **receive** them — the form with every
 * typed answer the user is not currently choosing stripped out.
 *
 * The form keeps that text so the box can still show it; this is the one
 * place that decides it does not count. It has to exist because the agent's
 * own precedence rule reads a non-empty custom answer *instead of* the
 * selection (see `toElicitationContent`), so leaving an abandoned draft in the
 * payload would silently send it over the option the user actually picked —
 * the control would show one answer and the agent would read another.
 *
 * Run everything that asks "is this answered?" through this too, or the tab
 * marker and the progress count would score a question on text that is never
 * going to be sent.
 */
export function effectiveAnswers(
  form: QuestionFormState,
  questions: readonly AgentElicitationQuestion[],
  chosen: ReadonlySet<string>,
): QuestionFormState {
  let out: Record<string, AgentElicitationAnswer> | undefined;
  for (const question of questions) {
    const answer = form[question.id];
    if (!answer?.custom || isCustomChosen(chosen, question.id)) continue;
    out ??= { ...form };
    const { custom: _ignored, ...rest } = answer;
    if (rest.value === undefined) delete out[question.id];
    else out[question.id] = rest;
  }
  return out ?? form;
}

/**
 * The form after the user types into a question's free-text box.
 *
 * Typing **clears that question's selection**, for every kind — including a
 * multi-select's ticks. Not a UI preference: the agent's own rule is that a
 * non-empty custom answer takes precedence over the selection
 * (`elicitation.js`, and `toElicitationContent` implements the same), so ticks
 * left on screen beside typed text are ticks the agent will never read. The
 * alternative — showing a selection that is silently discarded on send — is
 * the one failure this whole card is built to avoid.
 */
export function typeCustomAnswer(
  form: QuestionFormState,
  question: AgentElicitationQuestion,
  text: string,
): QuestionFormState {
  return setAnswerValue(
    setCustomAnswer(form, question.id, text),
    question.id,
    undefined,
  );
}

/** Mark a question's typed answer as chosen (or not), leaving the others
 *  alone. */
export function setCustomChosen(
  open: ReadonlySet<string>,
  id: string,
  next: boolean,
): ReadonlySet<string> {
  const out = new Set(open);
  if (next) out.add(id);
  else out.delete(id);
  return out;
}

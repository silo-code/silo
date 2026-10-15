/**
 * Form state for an inline agent **question** (RFC 0062 phase 5).
 *
 * The rules a question form has to get right are all about *absence*: which
 * controls the user has actually touched, and therefore which answers may be
 * sent. The agent reads an answered key as the user's word, so a control that
 * defaults to looking answered would put words in their mouth — the one thing
 * this RFC refuses to do.
 *
 * Pure and total, so the component stays thin glue: it holds one
 * {@link QuestionFormState} and calls these.
 */

import type {
  AgentElicitationAnswer,
  AgentElicitationQuestion,
} from "@silo-code/sdk";

/**
 * Answers collected so far, keyed by {@link AgentElicitationQuestion.id}.
 *
 * A question with no entry — or an entry with neither a `value` nor a
 * non-blank `custom` — is **unanswered**, and contributes no key to what the
 * agent receives.
 */
export type QuestionFormState = Readonly<
  Record<string, AgentElicitationAnswer>
>;

/** An empty form: nothing touched, nothing answered. */
export function initialFormState(): QuestionFormState {
  return {};
}

function patch(
  state: QuestionFormState,
  id: string,
  next: AgentElicitationAnswer,
): QuestionFormState {
  // Drop the key entirely when the answer has emptied out, so "unanswered"
  // has exactly one representation for {@link isAnswered} to read.
  const empty =
    next.value === undefined &&
    (next.custom === undefined || next.custom.trim() === "");
  if (empty) {
    const { [id]: _dropped, ...rest } = state;
    return rest;
  }
  return { ...state, [id]: next };
}

/** Set (or clear, with `undefined`) a question's own value. */
export function setAnswerValue(
  state: QuestionFormState,
  id: string,
  value: AgentElicitationAnswer["value"],
): QuestionFormState {
  const current = state[id] ?? {};
  return patch(state, id, { ...current, value });
}

/**
 * Add or remove one option of a `multi-select`.
 *
 * Removing the last selection clears the question back to unanswered rather
 * than leaving an empty array — an empty selection is not an answer.
 */
export function toggleMultiSelect(
  state: QuestionFormState,
  id: string,
  optionValue: string,
): QuestionFormState {
  const current = state[id] ?? {};
  const selected = Array.isArray(current.value)
    ? (current.value as readonly string[])
    : [];
  const next = selected.includes(optionValue)
    ? selected.filter((v) => v !== optionValue)
    : [...selected, optionValue];
  return patch(state, id, {
    ...current,
    value: next.length > 0 ? next : undefined,
  });
}

/** Set the free text for a question's custom-answer ("Other") box. */
export function setCustomAnswer(
  state: QuestionFormState,
  id: string,
  text: string,
): QuestionFormState {
  const current = state[id] ?? {};
  return patch(state, id, { ...current, custom: text });
}

/** Whether one option of a `multi-select` is currently selected. */
export function isOptionSelected(
  state: QuestionFormState,
  id: string,
  optionValue: string,
): boolean {
  const value = state[id]?.value;
  return Array.isArray(value) && value.includes(optionValue);
}

/** The single-select / text / number value to show in a control, as a string. */
export function controlValue(state: QuestionFormState, id: string): string {
  const value = state[id]?.value;
  if (value === undefined || Array.isArray(value)) return "";
  return String(value);
}

/** The text currently in a question's custom-answer box. */
export function customValue(state: QuestionFormState, id: string): string {
  return state[id]?.custom ?? "";
}

/**
 * Whether a question has an answer the agent would actually receive.
 *
 * A blank custom box does not count, mirroring the agent's own rule: it reads
 * a *non-empty* typed answer in preference to the selection and ignores an
 * empty one.
 */
export function isAnswered(
  state: QuestionFormState,
  question: AgentElicitationQuestion,
): boolean {
  const answer = state[question.id];
  if (!answer) return false;
  if (answer.custom !== undefined && answer.custom.trim() !== "") return true;
  if (answer.value === undefined) return false;
  if (Array.isArray(answer.value)) return answer.value.length > 0;
  // A `number` question's value arrives as the string an input produced; a
  // blank or unparseable one is dropped on serialize, so it is not an answer
  // here either.
  if (question.kind === "number") {
    const text = String(answer.value).trim();
    return text !== "" && Number.isFinite(Number(text));
  }
  if (typeof answer.value === "string") return answer.value.trim() !== "";
  return true;
}

/**
 * Whether **Send** should be enabled.
 *
 * An acknowledge-only request has nothing to fill in, so accepting is always
 * available — an empty `content` is the complete answer to a form that names
 * no fields. Otherwise at least one question must be answered: with none,
 * accepting sends exactly what Skip sends, and Skip says so honestly.
 */
export function canSubmit(
  state: QuestionFormState,
  questions: readonly AgentElicitationQuestion[],
): boolean {
  if (questions.length === 0) return true;
  return questions.some((q) => isAnswered(state, q));
}

/**
 * How many questions are answered, for a "2 of 3 answered" hint.
 *
 * Partial answers are legitimate — the bridge marks nothing required — so this
 * is a progress hint, never a gate beyond {@link canSubmit}.
 */
export function answeredCount(
  state: QuestionFormState,
  questions: readonly AgentElicitationQuestion[],
): number {
  return questions.filter((q) => isAnswered(state, q)).length;
}

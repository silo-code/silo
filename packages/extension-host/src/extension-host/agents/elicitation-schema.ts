/**
 * The `elicitation/create` schema parser (RFC 0062, phase 3).
 *
 * Turns the JSON Schema an ACP agent sends with a form elicitation into a flat
 * question list, and turns collected answers back into the `content` object the
 * agent reads. Both directions are pure and total — this module imports nothing
 * from the host runtime (no store, no services, no channel), which is what makes
 * it exhaustively testable without a running agent.
 *
 * Silo renders a deliberate **subset** of JSON Schema: the shape the
 * AskUserQuestion bridges actually emit (see `claude-agent-acp`'s
 * `elicitation.js`). Everything outside that subset degrades its *control* — an
 * unrecognized field becomes a text box — and never its visibility. A free-text
 * answer is a first-class answer in this protocol: the bridge's own "Other" box
 * produces one, and the agent reads a typed custom answer in preference to a
 * selection.
 */

/** One choice in a `select` / `multi-select` question. */
export interface ElicitationOption {
  /** The value written into `content` — the schema option's `const`. */
  value: string;
  /** What the user reads — the option's `title`, falling back to `value`. */
  label: string;
  /** Secondary text, when the option carried a `description`. */
  description?: string;
}

/**
 * The controls Silo can render. A closed union on purpose: it drives an
 * exhaustive `switch` in {@link toElicitationContent} and in the renderer.
 */
export type ElicitationQuestionKind =
  | "select"
  | "multi-select"
  | "text"
  | "boolean"
  | "number";

/**
 * The free-text "Other" box belonging to a question — a sibling schema property
 * marked with `_askUserQuestionCustomAnswer`. The marker is un-namespaced on
 * purpose so the same shape is recognizable across AskUserQuestion bridges.
 */
export interface ElicitationCustomAnswer {
  /** The schema property key a typed answer is written to. */
  field: string;
  /** The companion's own `title` (the bridges send `"Other"`). */
  label?: string;
  /** The companion's own `description`. */
  description?: string;
}

/** One question in a parsed elicitation. */
export interface ElicitationQuestion {
  /** The schema property key — also the `content` key the answer is written to. */
  id: string;
  kind: ElicitationQuestionKind;
  /** The question text to show. Never empty. */
  prompt: string;
  /** A short header above the prompt, when the schema carried a `title`. */
  title?: string;
  /** Present for `select` / `multi-select`, and never empty when present. */
  options?: ElicitationOption[];
  /** The question's own "Other" box, when the schema paired one with it. */
  custom?: ElicitationCustomAnswer;
}

/** The result of parsing `elicitation/create` params. */
export interface ParsedElicitation {
  /** The elicitation's own message — the human-readable ask. */
  message: string;
  /** One question per schema property, in schema order. */
  questions: ElicitationQuestion[];
  /**
   * True when there is nothing to fill in: the message with accept / decline /
   * cancel and no input. Always equivalent to an empty `questions`, but stated
   * so the renderer knows it is showing a bare acknowledgement *on purpose*
   * rather than having failed to find the fields.
   */
  acknowledgeOnly: boolean;
  /** The untouched params, for anything the model above does not name. */
  raw: Record<string, unknown>;
}

/**
 * `_meta` key marking a property as another question's custom-answer box. Shared
 * (not agent-namespaced) by the bridges' own deliberate choice.
 */
const CUSTOM_ANSWER_META_KEY = "_askUserQuestionCustomAnswer";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** A non-blank string, or `undefined` — so `title ?? value` fallbacks work. */
function asText(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

/** `{ description }` when there is one, `{}` otherwise — absent stays absent. */
function descriptionOf(v: unknown): { description?: string } {
  const text = asText(v);
  return text !== undefined ? { description: text } : {};
}

/**
 * The enum-option mapping, in one place: `const` → `value`, `title ?? const` →
 * `label`, `description` carried through. Shared by the single-select `oneOf`
 * path and the multi-select `items.anyOf` path so the two cannot drift.
 *
 * An entry with no usable `const` is dropped — there would be nothing to write
 * into `content` if the user picked it. An option's `preview` (under
 * `_claude/askUserQuestionOption`) has no model field yet; it rides along in
 * {@link ParsedElicitation.raw} until a renderer wants it.
 */
function parseEnumOptions(raw: unknown): ElicitationOption[] {
  if (!Array.isArray(raw)) return [];
  const out: ElicitationOption[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const value = asText(entry.const);
    if (value === undefined) continue;
    out.push({
      value,
      label: asText(entry.title) ?? value,
      ...descriptionOf(entry.description),
    });
  }
  return out;
}

/**
 * The fallback ladder, by *declared* type. An absent or unrecognized `type` is
 * a text box, and so is an enum shape that turned out to be malformed — a
 * select with no options is a question the user cannot answer, which is the one
 * outcome the ladder exists to prevent.
 */
function classify(property: Record<string, unknown>): {
  kind: ElicitationQuestionKind;
  options?: ElicitationOption[];
} {
  switch (asText(property.type)) {
    case "string": {
      const options = parseEnumOptions(property.oneOf);
      return options.length > 0
        ? { kind: "select", options }
        : { kind: "text" };
    }
    case "array": {
      const items = isRecord(property.items) ? property.items : undefined;
      const options = parseEnumOptions(items?.anyOf);
      return options.length > 0
        ? { kind: "multi-select", options }
        : { kind: "text" };
    }
    case "boolean":
      return { kind: "boolean" };
    case "number":
    case "integer":
      return { kind: "number" };
    default:
      return { kind: "text" };
  }
}

/** A property carrying the custom-answer marker, before it finds its target. */
interface PendingCompanion {
  questionId: string | undefined;
  companion: ElicitationCustomAnswer;
}

function readCompanion(
  key: string,
  property: Record<string, unknown>,
): PendingCompanion | undefined {
  const meta = isRecord(property._meta) ? property._meta : undefined;
  const marker = meta?.[CUSTOM_ANSWER_META_KEY];
  if (!isRecord(marker)) return undefined;
  const label = asText(property.title);
  return {
    questionId: asText(marker.questionId),
    companion: {
      field: key,
      ...(label !== undefined ? { label } : {}),
      ...descriptionOf(property.description),
    },
  };
}

/** A question still missing its `prompt`, which needs the final question count. */
interface DraftQuestion {
  id: string;
  kind: ElicitationQuestionKind;
  description?: string;
  title?: string;
  options?: ElicitationOption[];
  custom?: ElicitationCustomAnswer;
}

function draftQuestion(key: string, value: unknown): DraftQuestion {
  // A property whose body is not an object still gets a question: the *key* is
  // the only thing an answer needs, and a text box is answerable. The ladder
  // degrades the control, never the question.
  const property = isRecord(value) ? value : {};
  const { kind, options } = classify(property);
  const title = asText(property.title);
  const description = asText(property.description);
  return {
    id: key,
    kind,
    ...(title !== undefined ? { title } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(options !== undefined ? { options } : {}),
  };
}

/**
 * Parse `elicitation/create` params into a question list.
 *
 * Total: no input shape throws, and every defensive branch degrades toward a
 * question the user can still answer. Two passes over `properties`, because a
 * custom-answer companion may appear *before* the question it belongs to — a
 * single pass would drop a companion that leads its target.
 *
 * A `requestedSchema` that is not an object, or that carries no usable
 * `properties`, yields zero questions and {@link ParsedElicitation.acknowledgeOnly}:
 * with no property key there is nowhere for typed text to go, and an empty
 * `content` is the correct and complete answer to a form that names no fields.
 */
export function parseElicitation(params: unknown): ParsedElicitation {
  const raw = isRecord(params) ? params : {};
  const message = asText(raw.message) ?? "";
  const schema = isRecord(raw.requestedSchema)
    ? raw.requestedSchema
    : undefined;
  const properties = isRecord(schema?.properties) ? schema.properties : {};

  // Pass 1 — split the properties into questions and pending companions,
  // keeping schema order so a companion that fails to attach degrades in place.
  const slots: Array<
    | { kind: "question"; draft: DraftQuestion }
    | { kind: "companion"; key: string; pending: PendingCompanion }
  > = [];
  for (const [key, value] of Object.entries(properties)) {
    const pending = isRecord(value) ? readCompanion(key, value) : undefined;
    slots.push(
      pending
        ? { kind: "companion", key, pending }
        : { kind: "question", draft: draftQuestion(key, value) },
    );
  }

  // Pass 2 — attach each companion to its target. One that names an unknown
  // question (or no question at all) becomes an ordinary text question rather
  // than vanishing; so does a second companion claiming an already-paired
  // question, since first-wins is arbitrary but silently dropping is worse.
  const byId = new Map<string, DraftQuestion>();
  for (const slot of slots) {
    if (slot.kind === "question") byId.set(slot.draft.id, slot.draft);
  }
  const drafts: DraftQuestion[] = [];
  for (const slot of slots) {
    if (slot.kind === "question") {
      drafts.push(slot.draft);
      continue;
    }
    const { questionId, companion } = slot.pending;
    const target = questionId !== undefined ? byId.get(questionId) : undefined;
    if (target && target.custom === undefined) {
      target.custom = companion;
      continue;
    }
    drafts.push(draftQuestion(slot.key, properties[slot.key]));
  }

  // The prompt needs the final count: a single-question form carries its
  // question text in `message` rather than repeating it in the field.
  const single = drafts.length === 1;
  const questions = drafts.map((draft) => {
    const prompt =
      draft.description ??
      (single ? message : undefined) ??
      draft.title ??
      draft.id;
    const question: ElicitationQuestion = {
      id: draft.id,
      kind: draft.kind,
      prompt,
      ...(draft.title !== undefined ? { title: draft.title } : {}),
      ...(draft.options !== undefined ? { options: draft.options } : {}),
      ...(draft.custom !== undefined ? { custom: draft.custom } : {}),
    };
    return question;
  });

  return {
    message,
    questions,
    acknowledgeOnly: questions.length === 0,
    raw,
  };
}

/** What the renderer collected for one question. */
export interface ElicitationAnswer {
  /**
   * The selection or typed value. A `number` question's value may arrive as the
   * string an input element produced; it is coerced on the way out.
   */
  value?: string | readonly string[] | boolean | number;
  /** Free text from the question's "Other" box, when it has one. */
  custom?: string;
}

/** Collected answers, keyed by {@link ElicitationQuestion.id}. */
export type ElicitationAnswers = Record<string, ElicitationAnswer | undefined>;

/** The `content` object sent back with an accepted elicitation. */
export type ElicitationContent = Record<
  string,
  string | string[] | boolean | number
>;

function coerceList(
  value: string | readonly string[] | boolean | number,
): string[] {
  const entries = Array.isArray(value) ? value : [value];
  return entries.map((entry) => String(entry)).filter((entry) => entry !== "");
}

/**
 * The answers as **text to show the user afterwards**, keyed by question id.
 *
 * Deliberately not the wire payload {@link toElicitationContent} builds: that
 * one speaks the agent's language (option `value`s, coerced numbers, a custom
 * answer routed to its own field), and reading it back would show the user
 * identifiers they never saw. This reads the *labels* they picked.
 *
 * A question with no answer contributes no key, so "answered nothing here"
 * stays distinguishable from "answered with an empty string".
 */
export function toAnswerSummary(
  questions: readonly ElicitationQuestion[],
  answers: ElicitationAnswers,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const question of questions) {
    const answer = answers[question.id];
    if (!answer) continue;

    // Same precedence the agent itself applies: a typed answer stands in for
    // the selection rather than alongside it — and the same `question.custom`
    // guard as `toElicitationContent`. Without it, a typed answer to a
    // question with no companion field would be *shown* as the recorded
    // answer while the agent actually received the selection. The panel never
    // produces that state, but `respond()` is public surface and a
    // third-party chat UI can.
    const custom =
      typeof answer.custom === "string" ? answer.custom.trim() : "";
    if (custom !== "" && question.custom) {
      out[question.id] = custom;
      continue;
    }

    const { value } = answer;
    if (value === undefined) continue;

    const labelOf = (v: string): string =>
      question.options?.find((o) => o.value === v)?.label ?? v;

    if (Array.isArray(value)) {
      const labels = value.map((v) => labelOf(String(v)));
      if (labels.length > 0) out[question.id] = labels.join(", ");
      continue;
    }
    if (typeof value === "boolean") {
      out[question.id] = value ? "Yes" : "No";
      continue;
    }
    const text = String(value).trim();
    if (text !== "") out[question.id] = labelOf(text);
  }
  return out;
}

/**
 * Serialize collected answers into the protocol's `content` object, coerced to
 * each question's declared type.
 *
 * Two things are deliberately **omitted** rather than guessed:
 *
 * - An unanswered question contributes no key at all.
 * - A `number` (or `boolean`) answer that does not parse is dropped. The agent
 *   validates an accepted payload as a whole — `claude-agent-acp`'s
 *   `acceptedElicitationContent` yields *empty* content on a malformed accept —
 *   so sending `NaN` would throw away the user's other answers too. Losing one
 *   bad key beats risking all of them.
 *
 * A non-empty custom answer is written to the **companion's** field key and the
 * selection is left out: the agent reads the two keys separately and treats
 * typed text as overriding the selection. A custom answer on a question with no
 * companion has nowhere to go and is ignored — no renderer offers that box.
 */
export function toElicitationContent(
  questions: readonly ElicitationQuestion[],
  answers: ElicitationAnswers,
): ElicitationContent {
  const content: ElicitationContent = {};
  for (const question of questions) {
    const answer = answers[question.id];
    if (!answer) continue;

    const custom =
      typeof answer.custom === "string" ? answer.custom.trim() : "";
    if (custom !== "" && question.custom) {
      content[question.custom.field] = custom;
      continue;
    }

    const { value } = answer;
    if (value === undefined) continue;

    switch (question.kind) {
      case "multi-select": {
        const list = coerceList(value);
        if (list.length > 0) content[question.id] = list;
        break;
      }
      case "boolean": {
        if (typeof value === "boolean") content[question.id] = value;
        else if (value === "true" || value === "false")
          content[question.id] = value === "true";
        break;
      }
      case "number": {
        if (typeof value === "number") {
          if (Number.isFinite(value)) content[question.id] = value;
          break;
        }
        // A blank field is unanswered, not zero — `Number("")` is `0`, which
        // would put a number the user never typed in front of the agent.
        const text = typeof value === "string" ? value.trim() : "";
        if (text === "") break;
        const parsed = Number(text);
        if (Number.isFinite(parsed)) content[question.id] = parsed;
        break;
      }
      case "select":
      case "text": {
        const text = typeof value === "string" ? value : String(value);
        if (text !== "") content[question.id] = text;
        break;
      }
    }
  }
  return content;
}

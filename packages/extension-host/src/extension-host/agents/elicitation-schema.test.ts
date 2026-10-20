import { describe, it, expect } from "vitest";
import {
  parseElicitation,
  toElicitationContent,
  type ElicitationContent,
  type ElicitationQuestion,
  toAnswerSummary,
} from "./elicitation-schema";

/** `elicitation/create` params wrapping a flat object schema. */
function form(
  properties: Record<string, unknown>,
  message = "Please answer the following questions.",
): Record<string, unknown> {
  return {
    mode: "form",
    sessionId: "sess-1",
    message,
    requestedSchema: { type: "object", properties },
  };
}

/** The custom-answer companion the bridges pair with each select question. */
function companion(questionId: string): Record<string, unknown> {
  return {
    type: "string",
    title: "Other",
    description:
      "Type your own answer instead of choosing an option above (optional).",
    _meta: {
      _askUserQuestionCustomAnswer: { questionId, isCustomAnswer: true },
    },
  };
}

describe("parseElicitation — recognized shapes (R1)", () => {
  it("reads a titled oneOf as a single-select, const as the answer value", () => {
    const parsed = parseElicitation(
      form({
        pick: {
          type: "string",
          title: "Database",
          description: "Which database should I use?",
          oneOf: [
            {
              const: "PostgreSQL",
              title: "PostgreSQL",
              description: "Relational, battle-tested.",
            },
            { const: "sqlite" },
          ],
        },
      }),
    );
    expect(parsed.acknowledgeOnly).toBe(false);
    expect(parsed.questions).toEqual([
      {
        id: "pick",
        kind: "select",
        prompt: "Which database should I use?",
        title: "Database",
        options: [
          {
            value: "PostgreSQL",
            label: "PostgreSQL",
            description: "Relational, battle-tested.",
          },
          // No `title` — the label falls back to the `const`.
          { value: "sqlite", label: "sqlite" },
        ],
      },
    ]);
    // `toEqual` ignores undefined-valued keys, so absence needs its own check.
    const options = parsed.questions[0].options!;
    expect("description" in options[1]).toBe(false);
    expect("custom" in parsed.questions[0]).toBe(false);
  });

  it("reads an array whose items.anyOf is an enum as a multi-select", () => {
    const parsed = parseElicitation(
      form({
        feats: {
          type: "array",
          description: "Which features?",
          items: {
            anyOf: [
              { const: "Auth", title: "Auth" },
              { const: "Billing", title: "Billing", description: "Stripe." },
            ],
          },
        },
      }),
    );
    expect(parsed.questions[0].kind).toBe("multi-select");
    expect(parsed.questions[0].options).toEqual([
      { value: "Auth", label: "Auth" },
      { value: "Billing", label: "Billing", description: "Stripe." },
    ]);
  });

  it("reads a string with no enum as free text, carrying no options", () => {
    const parsed = parseElicitation(form({ name: { type: "string" } }));
    expect(parsed.questions[0].kind).toBe("text");
    expect("options" in parsed.questions[0]).toBe(false);
  });

  it("maps boolean, number and integer onto their controls", () => {
    const parsed = parseElicitation(
      form({
        ci: { type: "boolean" },
        ratio: { type: "number" },
        count: { type: "integer" },
      }),
    );
    expect(parsed.questions.map((q) => [q.id, q.kind])).toEqual([
      ["ci", "boolean"],
      ["ratio", "number"],
      ["count", "number"],
    ]);
  });

  it("keeps properties in schema order", () => {
    const parsed = parseElicitation(
      form({
        c: { type: "string" },
        a: { type: "string" },
        b: { type: "string" },
      }),
    );
    expect(parsed.questions.map((q) => q.id)).toEqual(["c", "a", "b"]);
  });

  it("falls back to the elicitation's message when a single question carries no description", () => {
    const parsed = parseElicitation(
      form(
        { pick: { type: "string", title: "Model" } },
        "Which model should I use?",
      ),
    );
    expect(parsed.message).toBe("Which model should I use?");
    expect(parsed.questions[0].prompt).toBe("Which model should I use?");
    expect(parsed.questions[0].title).toBe("Model");
  });

  it("does not repeat the generic message across several description-less questions", () => {
    const parsed = parseElicitation(
      form({ a: { type: "string", title: "First" }, b: { type: "string" } }),
      // Two questions: `message` is the bridge's generic preamble, not a prompt.
    );
    expect(parsed.questions.map((q) => q.prompt)).toEqual(["First", "b"]);
  });
});

describe("parseElicitation — the custom-answer companion (R2)", () => {
  it("attaches the companion to its question instead of listing it separately", () => {
    const parsed = parseElicitation(
      form({
        question_0: {
          type: "string",
          description: "Pick one",
          oneOf: [{ const: "a", title: "A" }],
        },
        question_0_custom: companion("question_0"),
      }),
    );
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.questions[0].custom).toEqual({
      field: "question_0_custom",
      label: "Other",
      description:
        "Type your own answer instead of choosing an option above (optional).",
    });
  });

  it("attaches a companion that precedes its target in schema order", () => {
    const parsed = parseElicitation(
      form({
        question_0_custom: companion("question_0"),
        question_0: {
          type: "string",
          description: "Pick one",
          oneOf: [{ const: "a", title: "A" }],
        },
      }),
    );
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.questions[0].id).toBe("question_0");
    expect(parsed.questions[0].custom?.field).toBe("question_0_custom");
  });

  it("degrades a companion naming an unknown question to an ordinary text question", () => {
    const parsed = parseElicitation(
      form({
        question_0: { type: "string", description: "Pick one" },
        stray_custom: companion("question_7"),
      }),
    );
    expect(parsed.questions.map((q) => [q.id, q.kind])).toEqual([
      ["question_0", "text"],
      ["stray_custom", "text"],
    ]);
    expect(parsed.questions[1].custom).toBeUndefined();
  });

  it("degrades a marker with no questionId at all, rather than dropping the field", () => {
    const parsed = parseElicitation(
      form({
        orphan: { type: "string", _meta: { _askUserQuestionCustomAnswer: {} } },
      }),
    );
    expect(parsed.questions.map((q) => q.id)).toEqual(["orphan"]);
  });

  it("keeps a second companion claiming the same question as its own field", () => {
    const parsed = parseElicitation(
      form({
        question_0: { type: "string", description: "Pick one" },
        question_0_custom: companion("question_0"),
        question_0_custom2: companion("question_0"),
      }),
    );
    expect(parsed.questions.map((q) => q.id)).toEqual([
      "question_0",
      "question_0_custom2",
    ]);
    expect(parsed.questions[0].custom?.field).toBe("question_0_custom");
  });
});

describe("parseElicitation — the fallback ladder (R3)", () => {
  it("yields text for an unknown or absent type", () => {
    const parsed = parseElicitation(
      form({ weird: { type: "geo-point" }, bare: {}, mistyped: { type: 7 } }),
    );
    expect(parsed.questions.map((q) => q.kind)).toEqual([
      "text",
      "text",
      "text",
    ]);
  });

  it("yields text, not an optionless select, for a malformed enum", () => {
    const parsed = parseElicitation(
      form({
        empty: { type: "string", oneOf: [] },
        // No usable `const` on any entry: nothing could be written to `content`.
        unusable: {
          type: "string",
          oneOf: [{ title: "A" }, "junk", null, { const: "" }],
        },
        notAnArray: { type: "string", oneOf: { const: "a" } },
        noItems: { type: "array" },
        badItems: { type: "array", items: { anyOf: [{ title: "A" }] } },
      }),
    );
    expect(parsed.questions.map((q) => q.kind)).toEqual([
      "text",
      "text",
      "text",
      "text",
      "text",
    ]);
    expect(parsed.questions.every((q) => q.options === undefined)).toBe(true);
  });

  it("keeps the usable options when only some entries are malformed", () => {
    const parsed = parseElicitation(
      form({
        pick: {
          type: "string",
          oneOf: [{ title: "no const" }, { const: "b", title: "B" }],
        },
      }),
    );
    expect(parsed.questions[0].kind).toBe("select");
    expect(parsed.questions[0].options).toEqual([{ value: "b", label: "B" }]);
  });

  it("still asks a question whose property body is not an object", () => {
    const parsed = parseElicitation(form({ junk: "not a schema", nil: null }));
    expect(parsed.questions.map((q) => [q.id, q.kind])).toEqual([
      ["junk", "text"],
      ["nil", "text"],
    ]);
  });

  it("falls back to the acknowledge form when the schema names no fields", () => {
    for (const schema of [
      undefined,
      null,
      "nope",
      42,
      {},
      { type: "object" },
      { type: "object", properties: {} },
      { type: "object", properties: "nope" },
      { type: "object", properties: [] },
      // An array is not a property bag — its indices are not field names, so
      // there is still nowhere to put an answer.
      { type: "object", properties: [{ type: "string" }] },
      { type: "object", properties: [["a", { type: "string" }]] },
      [{ type: "object" }],
    ]) {
      const parsed = parseElicitation({
        message: "May I proceed?",
        requestedSchema: schema,
      });
      expect(parsed.questions).toEqual([]);
      expect(parsed.acknowledgeOnly).toBe(true);
      expect(parsed.message).toBe("May I proceed?");
    }
  });

  it("is total — no input shape throws", () => {
    for (const input of [
      undefined,
      null,
      "",
      0,
      [],
      {},
      { message: 7 },
      { requestedSchema: { properties: { a: { type: "array", items: 3 } } } },
      { requestedSchema: { properties: { a: { _meta: "junk" } } } },
      {
        requestedSchema: {
          properties: { a: { _meta: { _askUserQuestionCustomAnswer: 1 } } },
        },
      },
    ]) {
      const parsed = parseElicitation(input);
      expect(typeof parsed.message).toBe("string");
      expect(Array.isArray(parsed.questions)).toBe(true);
    }
  });

  it("carries the whole params through as raw, including fields the model does not name", () => {
    const params = form({ a: { type: "string" } });
    params.toolCallId = "call-1";
    expect(parseElicitation(params).raw).toBe(params);
  });

  it("parses a property with no type but an enum as text, by declared type alone", () => {
    // The ladder classifies by `type`; an enum with no `type` is still answerable
    // as free text, which `applyAskElicitationResponse` reads as a valid answer.
    const parsed = parseElicitation(
      form({ pick: { oneOf: [{ const: "a" }] } }),
    );
    expect(parsed.questions[0].kind).toBe("text");
  });
});

/** Shorthand: the questions a schema parses to, for serializer tests. */
function questionsOf(
  properties: Record<string, unknown>,
): ElicitationQuestion[] {
  return parseElicitation(form(properties)).questions;
}

describe("toElicitationContent — coercion and omission (R4)", () => {
  const questions = questionsOf({
    pick: { type: "string", description: "p", oneOf: [{ const: "a" }] },
    feats: {
      type: "array",
      description: "f",
      items: { anyOf: [{ const: "x" }, { const: "y" }] },
    },
    note: { type: "string", description: "n" },
    ci: { type: "boolean", description: "c" },
    ratio: { type: "number", description: "r" },
  });

  it("coerces each kind to its declared type", () => {
    expect(
      toElicitationContent(questions, {
        pick: { value: "a" },
        feats: { value: ["x", "y"] },
        note: { value: "hello" },
        ci: { value: true },
        ratio: { value: "1.5" },
      }),
    ).toEqual({
      pick: "a",
      feats: ["x", "y"],
      note: "hello",
      ci: true,
      ratio: 1.5,
    });
  });

  it("keeps a false boolean — it is an answer, not an absence", () => {
    expect(toElicitationContent(questions, { ci: { value: false } })).toEqual({
      ci: false,
    });
  });

  it("omits an unparseable number rather than sending NaN", () => {
    // `""` and `[]` matter on their own: `Number("")` is `0`, so a blank field
    // would otherwise send a zero the user never typed.
    for (const value of ["", "   ", "abc", "1,5", true, [], NaN, Infinity]) {
      expect(
        toElicitationContent(questions, { ratio: { value: value as string } }),
      ).toEqual({});
    }
    expect(toElicitationContent(questions, { ratio: { value: 0 } })).toEqual({
      ratio: 0,
    });
    expect(
      toElicitationContent(questions, { ratio: { value: "-2.5" } }),
    ).toEqual({
      ratio: -2.5,
    });
  });

  it("omits a boolean it cannot read, rather than guessing a wrong one", () => {
    expect(toElicitationContent(questions, { ci: { value: "yes" } })).toEqual(
      {},
    );
    expect(toElicitationContent(questions, { ci: { value: "false" } })).toEqual(
      {
        ci: false,
      },
    );
  });

  it("contributes no key for an unanswered question", () => {
    expect(
      toElicitationContent(questions, {
        pick: undefined,
        note: {},
        feats: { value: [] },
        ratio: { value: undefined },
      }),
    ).toEqual({});
  });

  it("drops empty strings and empty selections", () => {
    expect(
      toElicitationContent(questions, {
        note: { value: "" },
        feats: { value: ["", "x"] },
      }),
    ).toEqual({ feats: ["x"] });
  });

  it("ignores answers for ids that are not questions", () => {
    expect(toElicitationContent(questions, { nope: { value: "x" } })).toEqual(
      {},
    );
  });

  it("writes a custom answer to the companion's key and leaves out the selection", () => {
    const paired = questionsOf({
      question_0: { type: "string", description: "p", oneOf: [{ const: "a" }] },
      question_0_custom: companion("question_0"),
    });
    expect(
      toElicitationContent(paired, {
        question_0: { value: "a", custom: "  something else  " },
      }),
    ).toEqual({ question_0_custom: "something else" });
  });

  it("keeps the selection when the custom box is blank", () => {
    const paired = questionsOf({
      question_0: { type: "string", description: "p", oneOf: [{ const: "a" }] },
      question_0_custom: companion("question_0"),
    });
    expect(
      toElicitationContent(paired, {
        question_0: { value: "a", custom: "   " },
      }),
    ).toEqual({ question_0: "a" });
  });

  it("ignores a custom answer on a question that has no companion", () => {
    expect(
      toElicitationContent(questions, {
        note: { value: "kept", custom: "nowhere" },
      }),
    ).toEqual({ note: "kept" });
  });

  it("returns empty content for the acknowledge form", () => {
    expect(toElicitationContent([], { anything: { value: "x" } })).toEqual({});
  });
});

/*
 * Round trip against Claude's real adapter output.
 *
 * The fixtures below are transcribed from what
 * `askUserQuestionsToCreateRequest` actually emits, and the reader from
 * `applyAskElicitationResponse`'s accept path, in
 * `@agentclientprotocol/claude-agent-acp/dist/elicitation.js` (0.75.1). This is
 * the only test here that can catch a wrong assumption about the wire shape —
 * the hand-written cases above all encode the same assumption the parser does.
 */

/** Field keys the adapter uses: `question_<n>` and `question_<n>_custom`. */
interface AskUserQuestion {
  question: string;
  header?: string;
  multiSelect?: boolean;
}

/**
 * `applyAskElicitationResponse`'s accept path, verbatim: a typed custom answer
 * wins over the selection, multi-selects comma-join, and an absent or empty
 * value contributes no answer.
 */
function readBackAnswers(
  content: ElicitationContent,
  questions: readonly AskUserQuestion[],
): Record<string, string> {
  const answers: Record<string, string> = {};
  questions.forEach((question, index) => {
    const custom = content[`question_${index}_custom`];
    if (typeof custom === "string" && custom.trim() !== "") {
      answers[question.question] = custom.trim();
      return;
    }
    const value = content[`question_${index}`];
    if (value === undefined || value === null) return;
    const text = Array.isArray(value) ? value.join(", ") : String(value);
    if (text === "") return;
    answers[question.question] = text;
  });
  return answers;
}

const TWO_QUESTIONS: AskUserQuestion[] = [
  { question: "Which database should I use?", header: "Database" },
  {
    question: "Which features should I scaffold?",
    header: "Features",
    multiSelect: true,
  },
];

/**
 * `askUserQuestionsToCreateRequest(TWO_QUESTIONS, "sess-1", "call-1")`. With
 * more than one question the prompt travels in each field's `description` and
 * `message` is the generic preamble; `title` is the question's `header`. Each
 * question's own "Other" field immediately follows it.
 */
const TWO_QUESTION_REQUEST = {
  mode: "form",
  sessionId: "sess-1",
  toolCallId: "call-1",
  message: "Please answer the following questions.",
  requestedSchema: {
    type: "object",
    properties: {
      question_0: {
        type: "string",
        title: "Database",
        description: "Which database should I use?",
        oneOf: [
          {
            const: "PostgreSQL",
            title: "PostgreSQL",
            description: "Relational, battle-tested.",
          },
          {
            const: "SQLite",
            title: "SQLite",
            description: "Zero-config, file-backed.",
            _meta: {
              "_claude/askUserQuestionOption": {
                preview: { type: "text", text: "sqlite3 app.db" },
              },
            },
          },
        ],
      },
      question_0_custom: {
        type: "string",
        title: "Other",
        description:
          "Type your own answer instead of choosing an option above (optional).",
        _meta: {
          _askUserQuestionCustomAnswer: {
            questionId: "question_0",
            isCustomAnswer: true,
          },
        },
      },
      question_1: {
        type: "array",
        title: "Features",
        description: "Which features should I scaffold?",
        items: {
          anyOf: [
            { const: "Auth", title: "Auth" },
            { const: "Billing", title: "Billing" },
            { const: "Admin UI", title: "Admin UI" },
          ],
        },
      },
      question_1_custom: {
        type: "string",
        title: "Other",
        description:
          "Type your own answer instead of choosing an option above (optional).",
        _meta: {
          _askUserQuestionCustomAnswer: {
            questionId: "question_1",
            isCustomAnswer: true,
          },
        },
      },
    },
  },
};

describe("round trip — Claude's AskUserQuestion bridge", () => {
  it("parses the two-question request into two paired questions", () => {
    const parsed = parseElicitation(TWO_QUESTION_REQUEST);
    expect(parsed.message).toBe("Please answer the following questions.");
    expect(parsed.acknowledgeOnly).toBe(false);
    // Four properties, two questions: each "Other" field folded into its own.
    expect(parsed.questions).toEqual([
      {
        id: "question_0",
        kind: "select",
        prompt: "Which database should I use?",
        title: "Database",
        options: [
          {
            value: "PostgreSQL",
            label: "PostgreSQL",
            description: "Relational, battle-tested.",
          },
          {
            value: "SQLite",
            label: "SQLite",
            description: "Zero-config, file-backed.",
          },
        ],
        custom: {
          field: "question_0_custom",
          label: "Other",
          description:
            "Type your own answer instead of choosing an option above (optional).",
        },
      },
      {
        id: "question_1",
        kind: "multi-select",
        prompt: "Which features should I scaffold?",
        title: "Features",
        options: [
          { value: "Auth", label: "Auth" },
          { value: "Billing", label: "Billing" },
          { value: "Admin UI", label: "Admin UI" },
        ],
        custom: {
          field: "question_1_custom",
          label: "Other",
          description:
            "Type your own answer instead of choosing an option above (optional).",
        },
      },
    ]);
  });

  it("leaves an option's preview reachable through raw", () => {
    const parsed = parseElicitation(TWO_QUESTION_REQUEST);
    const schema = parsed.raw.requestedSchema as {
      properties: { question_0: { oneOf: Array<Record<string, unknown>> } };
    };
    expect(schema.properties.question_0.oneOf[1]._meta).toEqual({
      "_claude/askUserQuestionOption": {
        preview: { type: "text", text: "sqlite3 app.db" },
      },
    });
  });

  it("serializes selections into the content the adapter reads back", () => {
    const { questions } = parseElicitation(TWO_QUESTION_REQUEST);
    const content = toElicitationContent(questions, {
      question_0: { value: "PostgreSQL" },
      question_1: { value: ["Auth", "Admin UI"] },
    });
    expect(content).toEqual({
      question_0: "PostgreSQL",
      question_1: ["Auth", "Admin UI"],
    });
    expect(readBackAnswers(content, TWO_QUESTIONS)).toEqual({
      "Which database should I use?": "PostgreSQL",
      "Which features should I scaffold?": "Auth, Admin UI",
    });
  });

  it("serializes a typed custom answer so the adapter prefers it over the selection", () => {
    const { questions } = parseElicitation(TWO_QUESTION_REQUEST);
    const content = toElicitationContent(questions, {
      question_0: { value: "PostgreSQL", custom: "Cloudflare D1" },
      question_1: { value: ["Billing"] },
    });
    expect(content).toEqual({
      question_0_custom: "Cloudflare D1",
      question_1: ["Billing"],
    });
    expect(readBackAnswers(content, TWO_QUESTIONS)).toEqual({
      "Which database should I use?": "Cloudflare D1",
      "Which features should I scaffold?": "Billing",
    });
  });

  it("drops a skipped question from the answers, which the adapter reads as a skip", () => {
    const { questions } = parseElicitation(TWO_QUESTION_REQUEST);
    const content = toElicitationContent(questions, {
      question_1: { value: ["Auth"] },
    });
    expect(readBackAnswers(content, TWO_QUESTIONS)).toEqual({
      "Which features should I scaffold?": "Auth",
    });
  });

  it("reads a single-question request's prompt from message, as the adapter sends it", () => {
    // One question: the adapter puts the text in `message` and leaves the
    // field's `description` undefined rather than repeating it.
    const parsed = parseElicitation({
      mode: "form",
      sessionId: "sess-1",
      message: "Should I use TypeScript?",
      requestedSchema: {
        type: "object",
        properties: {
          question_0: {
            type: "string",
            title: undefined,
            description: undefined,
            oneOf: [
              { const: "Yes", title: "Yes" },
              { const: "No", title: "No" },
            ],
          },
          question_0_custom: {
            type: "string",
            title: "Other",
            description:
              "Type your own answer instead of choosing an option above (optional).",
            _meta: {
              _askUserQuestionCustomAnswer: {
                questionId: "question_0",
                isCustomAnswer: true,
              },
            },
          },
        },
      },
    });
    expect(parsed.questions).toHaveLength(1);
    expect(parsed.questions[0].prompt).toBe("Should I use TypeScript?");
    // The adapter sends `title: undefined` for a question with no header; the
    // key must not survive onto the model.
    expect("title" in parsed.questions[0]).toBe(false);
    const content = toElicitationContent(parsed.questions, {
      question_0: { value: "Yes" },
    });
    expect(
      readBackAnswers(content, [{ question: "Should I use TypeScript?" }]),
    ).toEqual({ "Should I use TypeScript?": "Yes" });
  });
});

describe("toAnswerSummary — the answers in the user's own words", () => {
  const questions = [
    {
      id: "branch",
      kind: "select" as const,
      prompt: "Which branch?",
      options: [
        { value: "main", label: "main" },
        { value: "dev", label: "develop" },
      ],
      custom: { field: "branch_custom", label: "Other" },
    },
    {
      id: "tools",
      kind: "multi-select" as const,
      prompt: "Which tools?",
      options: [
        { value: "a", label: "Auth" },
        { value: "b", label: "Billing" },
      ],
    },
  ];

  // The whole reason this is not the wire payload: the agent receives the
  // option's `value`, which is an identifier the user never saw.
  it("reads back the label the user picked, not the value sent", () => {
    expect(toAnswerSummary(questions, { branch: { value: "dev" } })).toEqual({
      branch: "develop",
    });
  });

  it("joins a multi-select into one readable line", () => {
    expect(
      toAnswerSummary(questions, { tools: { value: ["a", "b"] } }),
    ).toEqual({ tools: "Auth, Billing" });
  });

  it("shows typed text in preference to a selection, as the agent reads it", () => {
    expect(
      toAnswerSummary(questions, {
        branch: { value: "main", custom: "a release branch" },
      }),
    ).toEqual({ branch: "a release branch" });
  });

  it("writes a boolean as the words the user clicked", () => {
    const yesNo = [{ id: "tests", kind: "boolean" as const, prompt: "Tests?" }];
    expect(toAnswerSummary(yesNo, { tests: { value: true } })).toEqual({
      tests: "Yes",
    });
    expect(toAnswerSummary(yesNo, { tests: { value: false } })).toEqual({
      tests: "No",
    });
  });

  // "Answered nothing here" has to stay distinguishable from "answered with
  // an empty string" — the row says "Not answered" for the former.
  it("contributes no key for a question left alone", () => {
    expect(toAnswerSummary(questions, { branch: { value: "main" } })).toEqual({
      branch: "main",
    });
    expect(toAnswerSummary(questions, {})).toEqual({});
    expect(toAnswerSummary(questions, { branch: { custom: "   " } })).toEqual(
      {},
    );
  });

  // Must match `toElicitationContent`'s rule exactly: with no companion field
  // there is nowhere to put the text, so the agent receives the selection —
  // and showing the text as the recorded answer would misreport that.
  it("ignores typed text on a question with no companion field, as the payload does", () => {
    const noCompanion = [
      {
        id: "branch",
        kind: "select" as const,
        prompt: "Which branch?",
        options: [{ value: "main", label: "main" }],
      },
    ];
    expect(
      toAnswerSummary(noCompanion, {
        branch: { value: "main", custom: "a release branch" },
      }),
    ).toEqual({ branch: "main" });
  });

  it("falls back to the raw value when no option matches it", () => {
    expect(toAnswerSummary(questions, { branch: { value: "ghost" } })).toEqual({
      branch: "ghost",
    });
  });
});

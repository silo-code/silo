import { describe, it, expect } from "vitest";
import type { AgentElicitationQuestion } from "@silo-code/sdk";
import {
  activeQuestion,
  effectiveAnswers,
  typeCustomAnswer,
  customIsAnOption,
  isCustomChosen,
  questionTabs,
  setCustomChosen,
  tabLabel,
} from "./question-tabs";
import { setAnswerValue, setCustomAnswer } from "./question-form";

function q(
  over: Partial<AgentElicitationQuestion> & { id: string },
): AgentElicitationQuestion {
  return {
    kind: "select",
    prompt: "Which branch should I work on?",
    options: [
      { value: "main", label: "main" },
      { value: "develop", label: "develop" },
    ],
    ...over,
  };
}

describe("tabLabel", () => {
  it("uses the agent's own short header", () => {
    expect(tabLabel(q({ id: "a", title: "Branch" }), 0)).toBe("Branch");
  });

  // Falling back to the prompt would put a whole sentence in the tab strip.
  it("numbers a question with no header rather than using its prompt", () => {
    expect(tabLabel(q({ id: "a" }), 0)).toBe("Question 1");
    expect(tabLabel(q({ id: "b" }), 2)).toBe("Question 3");
  });
});

describe("questionTabs", () => {
  const questions = [
    q({ id: "branch", title: "Branch" }),
    q({ id: "tests", title: "Tests" }),
  ];

  it("keeps the agent's question order", () => {
    expect(questionTabs(questions, {}).map((t) => t.label)).toEqual([
      "Branch",
      "Tests",
    ]);
  });

  // The reason the strip carries state at all: with one question visible,
  // nothing else can tell you the other is still waiting.
  it("marks only the questions that are actually answered", () => {
    const form = setAnswerValue({}, "branch", "main");
    expect(questionTabs(questions, form).map((t) => t.answered)).toEqual([
      true,
      false,
    ]);
  });

  it("counts a typed answer as answered, same as a selection", () => {
    const form = setCustomAnswer({}, "tests", "only the unit ones");
    expect(questionTabs(questions, form)[1].answered).toBe(true);
  });

  it("does not count a box with only whitespace in it", () => {
    const form = setCustomAnswer({}, "tests", "   ");
    expect(questionTabs(questions, form)[1].answered).toBe(false);
  });
});

describe("activeQuestion", () => {
  const questions = [q({ id: "a" }), q({ id: "b" })];

  it("shows the question the user picked", () => {
    expect(activeQuestion(questions, "b")?.id).toBe("b");
  });

  // An empty tab panel reads as a broken card; the first question does not.
  it("falls back to the first when the remembered id is gone", () => {
    expect(activeQuestion(questions, "vanished")?.id).toBe("a");
  });

  it("is undefined only when there are no questions at all", () => {
    expect(activeQuestion([], "a")).toBeUndefined();
  });
});

describe("customIsAnOption", () => {
  const custom = { field: "a_custom", label: "Other" };

  it("adds an Other entry to a list that has options to sit beside", () => {
    expect(customIsAnOption(q({ id: "a", custom }))).toBe(true);
  });

  // A text question already *is* free text — a second box below it would be
  // asking the same thing twice.
  it("offers no Other entry for a text question", () => {
    expect(
      customIsAnOption(q({ id: "a", kind: "text", options: [], custom })),
    ).toBe(false);
  });

  it("is false for a question the agent gave no custom field", () => {
    expect(customIsAnOption(q({ id: "a" }))).toBe(false);
  });
});

describe("isCustomChosen / setCustomChosen", () => {
  it("marks and unmarks one question without touching another", () => {
    let chosen = setCustomChosen(new Set(), "a", true);
    chosen = setCustomChosen(chosen, "b", true);
    chosen = setCustomChosen(chosen, "a", false);
    expect(isCustomChosen(chosen, "a")).toBe(false);
    expect(isCustomChosen(chosen, "b")).toBe(true);
  });

  it("is not chosen for an untouched question", () => {
    expect(isCustomChosen(new Set(), "a")).toBe(false);
  });
});

describe("typeCustomAnswer", () => {
  // The agent reads a non-empty custom answer *instead of* the selection, for
  // every kind — so a selection left on screen beside typed text is a
  // selection nobody receives.
  it("clears a single-select's choice", () => {
    const form = setAnswerValue({}, "branch", "main");
    const next = typeCustomAnswer(form, q({ id: "branch" }), "a release one");
    expect(next.branch).toEqual({ custom: "a release one" });
  });

  it("clears a multi-select's ticks too — the protocol makes no exception", () => {
    const multi = q({ id: "tools", kind: "multi-select" });
    const form = setAnswerValue({}, "tools", ["a", "b"]);
    const next = typeCustomAnswer(form, multi, "something else");
    expect(next.tools).toEqual({ custom: "something else" });
  });

  it("leaves the question unanswered when the text is emptied again", () => {
    let form = typeCustomAnswer({}, q({ id: "branch" }), "draft");
    form = typeCustomAnswer(form, q({ id: "branch" }), "");
    expect(form).toEqual({});
  });
});

describe("effectiveAnswers", () => {
  const questions = [q({ id: "branch", title: "Branch" })];
  const draft = setCustomAnswer({}, "branch", "a release branch");

  it("sends the typed answer when it is the chosen one", () => {
    const chosen = setCustomChosen(new Set(), "branch", true);
    expect(effectiveAnswers(draft, questions, chosen)).toEqual(draft);
  });

  // The point of the whole projection: the agent reads a non-empty custom
  // answer *instead of* the selection, so an abandoned draft left in the
  // payload would be sent over the option the user actually picked.
  it("drops an abandoned draft so the option the user picked is what is sent", () => {
    const form = setAnswerValue(draft, "branch", "main");
    expect(effectiveAnswers(form, questions, new Set())).toEqual({
      branch: { value: "main" },
    });
  });

  it("leaves the question unanswered when the draft was all it had", () => {
    expect(effectiveAnswers(draft, questions, new Set())).toEqual({});
  });

  it("returns the form itself when there is nothing to strip", () => {
    const form = setAnswerValue({}, "branch", "main");
    expect(effectiveAnswers(form, questions, new Set())).toBe(form);
  });

  it("does not mutate the form it was given", () => {
    const form = setAnswerValue(draft, "branch", "main");
    const before = JSON.stringify(form);
    effectiveAnswers(form, questions, new Set());
    expect(JSON.stringify(form)).toBe(before);
  });

  it("judges each question on its own chosen state", () => {
    const two = [q({ id: "a" }), q({ id: "b" })];
    let form = setCustomAnswer({}, "a", "mine");
    form = setCustomAnswer(form, "b", "theirs");
    const chosen = setCustomChosen(new Set(), "a", true);
    expect(effectiveAnswers(form, two, chosen)).toEqual({
      a: { custom: "mine" },
    });
  });
});

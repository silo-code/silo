import { describe, it, expect } from "vitest";
import type { AgentElicitationQuestion } from "@silo-code/sdk";
import {
  answeredCount,
  canSubmit,
  controlValue,
  customValue,
  initialFormState,
  isAnswered,
  isOptionSelected,
  setAnswerValue,
  setCustomAnswer,
  toggleMultiSelect,
} from "./question-form";

function question(
  over: Partial<AgentElicitationQuestion> = {},
): AgentElicitationQuestion {
  return {
    id: "question_0",
    kind: "select",
    prompt: "Which database?",
    options: [
      { value: "PostgreSQL", label: "PostgreSQL" },
      { value: "SQLite", label: "SQLite" },
    ],
    custom: { field: "question_0_custom", label: "Other" },
    ...over,
  };
}

describe("setAnswerValue", () => {
  it("records a selection and reads it back for the control", () => {
    const state = setAnswerValue(initialFormState(), "question_0", "SQLite");
    expect(controlValue(state, "question_0")).toBe("SQLite");
    expect(isAnswered(state, question())).toBe(true);
  });

  it("clearing a value drops the question back to unanswered", () => {
    let state = setAnswerValue(initialFormState(), "question_0", "SQLite");
    state = setAnswerValue(state, "question_0", undefined);
    // One representation of "unanswered": no key at all.
    expect(state).toEqual({});
    expect(isAnswered(state, question())).toBe(false);
  });

  it("keeps a typed custom answer when the selection is cleared", () => {
    let state = setCustomAnswer(initialFormState(), "question_0", "D1");
    state = setAnswerValue(state, "question_0", "SQLite");
    state = setAnswerValue(state, "question_0", undefined);
    expect(customValue(state, "question_0")).toBe("D1");
    expect(isAnswered(state, question())).toBe(true);
  });

  it("reads an empty string for an untouched control", () => {
    expect(controlValue(initialFormState(), "question_0")).toBe("");
    expect(customValue(initialFormState(), "question_0")).toBe("");
  });

  it("reads a boolean and a number back as control text", () => {
    const yes = setAnswerValue(initialFormState(), "q", true);
    expect(controlValue(yes, "q")).toBe("true");
    const n = setAnswerValue(initialFormState(), "q", 3);
    expect(controlValue(n, "q")).toBe("3");
  });

  it("reads an empty string rather than a joined list for a multi-select", () => {
    const state = toggleMultiSelect(initialFormState(), "q", "Auth");
    expect(controlValue(state, "q")).toBe("");
  });
});

describe("toggleMultiSelect", () => {
  const multi = question({ kind: "multi-select", id: "q" });

  it("adds, keeps order, and reports selection", () => {
    let state = toggleMultiSelect(initialFormState(), "q", "Auth");
    state = toggleMultiSelect(state, "q", "Billing");
    expect(state.q?.value).toEqual(["Auth", "Billing"]);
    expect(isOptionSelected(state, "q", "Auth")).toBe(true);
    expect(isOptionSelected(state, "q", "Admin")).toBe(false);
  });

  it("removes a selected option", () => {
    let state = toggleMultiSelect(initialFormState(), "q", "Auth");
    state = toggleMultiSelect(state, "q", "Billing");
    state = toggleMultiSelect(state, "q", "Auth");
    expect(state.q?.value).toEqual(["Billing"]);
  });

  it("deselecting the last option is unanswered, not an empty selection", () => {
    let state = toggleMultiSelect(initialFormState(), "q", "Auth");
    state = toggleMultiSelect(state, "q", "Auth");
    expect(state).toEqual({});
    expect(isAnswered(state, multi)).toBe(false);
  });

  it("does not disturb the question's custom answer", () => {
    let state = setCustomAnswer(initialFormState(), "q", "Something else");
    state = toggleMultiSelect(state, "q", "Auth");
    expect(state.q).toEqual({ custom: "Something else", value: ["Auth"] });
  });
});

describe("setCustomAnswer", () => {
  it("records text and makes the question answered", () => {
    const state = setCustomAnswer(initialFormState(), "question_0", "D1");
    expect(customValue(state, "question_0")).toBe("D1");
    expect(isAnswered(state, question())).toBe(true);
  });

  it("blank text is not an answer — the agent ignores an empty custom box", () => {
    for (const text of ["", "   ", "\t\n"]) {
      const state = setCustomAnswer(initialFormState(), "question_0", text);
      expect(isAnswered(state, question())).toBe(false);
    }
  });

  it("clearing the box back to blank leaves the selection answered", () => {
    let state = setAnswerValue(initialFormState(), "question_0", "SQLite");
    state = setCustomAnswer(state, "question_0", "D1");
    state = setCustomAnswer(state, "question_0", "");
    expect(isAnswered(state, question())).toBe(true);
    expect(controlValue(state, "question_0")).toBe("SQLite");
  });

  it("clearing the box with no selection drops the question entirely", () => {
    let state = setCustomAnswer(initialFormState(), "question_0", "D1");
    state = setCustomAnswer(state, "question_0", "  ");
    expect(state).toEqual({});
  });
});

describe("isAnswered", () => {
  it("treats a blank or unparseable number as unanswered", () => {
    const numeric = question({ kind: "number", id: "n", options: undefined });
    for (const value of ["", "  ", "abc", "1,5"]) {
      expect(
        isAnswered(setAnswerValue(initialFormState(), "n", value), numeric),
      ).toBe(false);
    }
    // Zero is a real answer, and a negative/decimal parses.
    expect(
      isAnswered(setAnswerValue(initialFormState(), "n", "0"), numeric),
    ).toBe(true);
    expect(
      isAnswered(setAnswerValue(initialFormState(), "n", "-2.5"), numeric),
    ).toBe(true);
  });

  it("treats whitespace-only text as unanswered", () => {
    const text = question({ kind: "text", id: "t", options: undefined });
    expect(
      isAnswered(setAnswerValue(initialFormState(), "t", "   "), text),
    ).toBe(false);
    expect(
      isAnswered(setAnswerValue(initialFormState(), "t", "hi"), text),
    ).toBe(true);
  });

  it("does not let a blank custom box rescue an otherwise-unanswered question", () => {
    // The key survives (the value is non-empty as a *string*) but neither half
    // is a real answer: the text is whitespace and the box is blank. The agent
    // ignores an empty custom field, so this must read as unanswered.
    const text = question({ kind: "text", id: "t", options: undefined });
    let state = setAnswerValue(initialFormState(), "t", "   ");
    state = setCustomAnswer(state, "t", "");
    expect(state.t).toEqual({ value: "   ", custom: "" });
    expect(isAnswered(state, text)).toBe(false);
    expect(canSubmit(state, [text])).toBe(false);
  });

  it("treats a false boolean as answered — it is an answer, not an absence", () => {
    const bool = question({ kind: "boolean", id: "b", options: undefined });
    expect(
      isAnswered(setAnswerValue(initialFormState(), "b", false), bool),
    ).toBe(true);
    expect(isAnswered(initialFormState(), bool)).toBe(false);
  });
});

describe("canSubmit", () => {
  const two = [question(), question({ id: "question_1", kind: "text" })];

  it("is false until something is answered — Skip says the same thing honestly", () => {
    expect(canSubmit(initialFormState(), two)).toBe(false);
  });

  it("is true once any one question is answered, since nothing is required", () => {
    const state = setAnswerValue(initialFormState(), "question_0", "SQLite");
    expect(canSubmit(state, two)).toBe(true);
    expect(answeredCount(state, two)).toBe(1);
  });

  it("is true for an acknowledge-only request, which has nothing to fill in", () => {
    expect(canSubmit(initialFormState(), [])).toBe(true);
  });

  it("goes back to false when the only answer is taken away", () => {
    let state = setAnswerValue(initialFormState(), "question_0", "SQLite");
    state = setAnswerValue(state, "question_0", undefined);
    expect(canSubmit(state, two)).toBe(false);
  });

  it("counts a custom-only answer", () => {
    const state = setCustomAnswer(initialFormState(), "question_0", "D1");
    expect(canSubmit(state, two)).toBe(true);
    expect(answeredCount(state, two)).toBe(1);
  });

  it("ignores answers for ids that are not questions in this form", () => {
    const state = setAnswerValue(initialFormState(), "stranger", "x");
    expect(canSubmit(state, two)).toBe(false);
    expect(answeredCount(state, two)).toBe(0);
  });
});

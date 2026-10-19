import { describe, it, expect } from "vitest";
import { questionOutcome, showQuestionRow } from "./question-row";
import type { QuestionEntry } from "./transcript-model";

function entry(over: Partial<QuestionEntry> = {}): QuestionEntry {
  return {
    type: "question",
    key: "q1",
    elicitationId: "e1",
    message: "Which branch?",
    questions: [],
    acknowledgeOnly: false,
    ...over,
  };
}

describe("questionOutcome", () => {
  it("says nothing for a question that is still open", () => {
    expect(questionOutcome(undefined)).toBeUndefined();
  });

  it("names each outcome the user chose", () => {
    expect(questionOutcome("answered")).toBe("You answered this.");
    expect(questionOutcome("skipped")).toBe("You skipped this.");
    expect(questionOutcome("cancelled")).toMatch(/cancelled/);
  });

  // The whole point of the row: the user must be able to tell that nothing was
  // sent, and what to do about it.
  it("explains an interrupted question and names the way forward", () => {
    const text = questionOutcome("interrupted");
    expect(text).toMatch(/never got a reply/);
    expect(text).toMatch(/Send a message/);
  });

  // `interrupted` is also written by `dispose()` — a closed panel, a profile
  // switch, a session reset. Naming a reload would be false for all of those.
  it("does not blame a reload, which is only one of the ways it happens", () => {
    expect(questionOutcome("interrupted")).not.toMatch(/reload/i);
  });
});

describe("showQuestionRow", () => {
  it("stands down while the live card is showing the same question", () => {
    expect(showQuestionRow(entry(), new Set(["e1"]))).toBe(false);
  });

  it("takes over once that card retires", () => {
    expect(showQuestionRow(entry(), new Set())).toBe(true);
  });

  it("is unaffected by another question being open", () => {
    expect(showQuestionRow(entry(), new Set(["e2"]))).toBe(true);
  });
});

import { describe, expect, it } from "vitest";

import {
  PROMPT_COLLAPSE_CANDIDATE_CHARS,
  PROMPT_COLLAPSE_MAX_LINES,
  promptIsClipped,
  promptMayOverflow,
  promptToggleLabel,
} from "./prompt-collapse";

describe("promptMayOverflow", () => {
  it("skips a short single-line prompt", () => {
    expect(promptMayOverflow("fix the build")).toBe(false);
  });

  it("skips an empty prompt (an attachments-only turn with no files)", () => {
    expect(promptMayOverflow("")).toBe(false);
  });

  it("measures a prompt long enough to wrap past the clip", () => {
    expect(promptMayOverflow("x".repeat(PROMPT_COLLAPSE_CANDIDATE_CHARS))).toBe(
      true,
    );
  });

  it("leaves one character short of the threshold alone", () => {
    expect(
      promptMayOverflow("x".repeat(PROMPT_COLLAPSE_CANDIDATE_CHARS - 1)),
    ).toBe(false);
  });

  it("measures a prompt with more hard lines than the clip shows", () => {
    const lines = Array.from(
      { length: PROMPT_COLLAPSE_MAX_LINES + 1 },
      () => "a",
    ).join("\n");
    expect(lines.length).toBeLessThan(PROMPT_COLLAPSE_CANDIDATE_CHARS);
    expect(promptMayOverflow(lines)).toBe(true);
  });

  it("leaves a prompt that exactly fills the clip alone", () => {
    const lines = Array.from({ length: PROMPT_COLLAPSE_MAX_LINES }, () => "a");
    expect(promptMayOverflow(lines.join("\n"))).toBe(false);
  });

  it("measures any prompt carrying attachments, however short", () => {
    // Chips wrap, so a one-word prompt with forty files is tall — and would
    // otherwise be clipped with no toggle to open it.
    expect(promptMayOverflow("this", 40)).toBe(true);
    expect(promptMayOverflow("this", 1)).toBe(true);
    expect(promptMayOverflow("this", 0)).toBe(false);
  });
});

describe("promptIsClipped", () => {
  it("is true when the content is taller than its clip", () => {
    expect(promptIsClipped(400, 260)).toBe(true);
  });

  it("is false when the content fits", () => {
    expect(promptIsClipped(120, 260)).toBe(false);
  });

  it("absorbs sub-pixel layout noise rather than offering an empty reveal", () => {
    expect(promptIsClipped(260.4, 260)).toBe(false);
    expect(promptIsClipped(262, 260)).toBe(false);
    expect(promptIsClipped(263, 260)).toBe(true);
  });
});

describe("promptToggleLabel", () => {
  it("names what the click will do", () => {
    expect(promptToggleLabel(false)).toBe("Show more");
    expect(promptToggleLabel(true)).toBe("Show less");
  });
});

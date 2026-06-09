import { describe, it, expect } from "vitest";
import { summarizeGitError } from "./notify-error";

describe("summarizeGitError", () => {
  it("strips a leading 'Error:' prefix and trims surrounding whitespace", () => {
    const { detail } = summarizeGitError(
      new Error("fatal: nothing to commit"),
      "Commit failed",
    );
    expect(detail).toBe("fatal: nothing to commit");
  });

  it("uses the first line as the summary and flags the rest as more detail", () => {
    const { summary, hasMore } = summarizeGitError(
      "pre-commit: lint failed\n  src/foo.ts:1:1 error\ncommit aborted",
      "Commit failed",
    );
    expect(summary).toBe("pre-commit: lint failed");
    expect(hasMore).toBe(true);
  });

  it("reports no extra detail for a single-line error", () => {
    const { summary, hasMore } = summarizeGitError(
      "fatal: nothing to commit, working tree clean",
      "Commit failed",
    );
    expect(summary).toBe("fatal: nothing to commit, working tree clean");
    expect(hasMore).toBe(false);
  });

  it("treats trailing lines beyond the first as more detail", () => {
    // Same first line, but extra trailing content → hasMore.
    const { summary, hasMore } = summarizeGitError("oops\n", "Push failed");
    expect(summary).toBe("oops");
    expect(hasMore).toBe(false); // the trailing newline is trimmed away
  });

  it("falls back to the title when the error has no text", () => {
    const { detail, summary, hasMore } = summarizeGitError("", "Stage failed");
    expect(detail).toBe("");
    expect(summary).toBe("Stage failed");
    expect(hasMore).toBe(false);
  });

  it("accepts non-Error throwables via String() coercion", () => {
    expect(summarizeGitError({ toString: () => "boom" }, "x").summary).toBe(
      "boom",
    );
  });
});

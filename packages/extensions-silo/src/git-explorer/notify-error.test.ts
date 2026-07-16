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

  it("prefers a native git fatal:/error: line over surrounding lines", () => {
    const { summary, hasMore } = summarizeGitError(
      "→ Running boundary lint…\nfatal: not a git repository\nmore noise",
      "Status failed",
    );
    expect(summary).toBe("fatal: not a git repository");
    expect(hasMore).toBe(true);
  });

  it("surfaces the conclusive failure line from hook output, not the first progress line", () => {
    const detail = [
      "→ Running boundary lint…",
      "→ Formatting staged files…",
      "→ Running unit tests…",
      "✖   subject may not be empty [subject-empty]",
      "✖   found 2 problems, 0 warnings",
      "✖ Commit blocked: message must follow Conventional Commits",
      "  e.g. 'feat(terminal): add split pane'",
    ].join("\n");
    const { summary, hasMore } = summarizeGitError(detail, "Commit failed");
    expect(summary).toBe(
      "✖ Commit blocked: message must follow Conventional Commits",
    );
    expect(hasMore).toBe(true);
  });

  it("falls back to the last line when nothing looks like an error marker", () => {
    const { summary } = summarizeGitError(
      "step one\nstep two\nstep three",
      "Commit failed",
    );
    expect(summary).toBe("step three");
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

  it("strips ANSI escape codes from colorized hook output", () => {
    const detail = summarizeGitError(
      "\x1b[32m✓\x1b[39m tests passed\nfatal: \x1b[31mnothing to commit\x1b[39m",
      "Commit failed",
    ).detail;
    expect(detail).toBe("✓ tests passed\nfatal: nothing to commit");
  });
});

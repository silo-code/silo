import { describe, it, expect } from "vitest";
import { describeCloseWarning } from "./agent-close-guard";

describe("describeCloseWarning", () => {
  it("names a single running agent", () => {
    expect(describeCloseWarning(1)).toBe(
      "1 chat agent is currently running. Closing Silo will cancel it.",
    );
  });

  it("pluralizes for multiple running agents", () => {
    expect(describeCloseWarning(3)).toBe(
      "3 chat agents are currently running. Closing Silo will cancel them.",
    );
  });
});

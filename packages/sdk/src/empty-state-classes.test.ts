import { describe, it, expect } from "vitest";
import { emptyStateIconDataTone } from "./empty-state-classes";

describe("emptyStateIconDataTone", () => {
  it("omits data-tone for the neutral default", () => {
    expect(emptyStateIconDataTone()).toBeUndefined();
    expect(emptyStateIconDataTone("neutral")).toBeUndefined();
  });

  it("sets data-tone=ok for the positive-empty tone", () => {
    expect(emptyStateIconDataTone("ok")).toBe("ok");
  });
});

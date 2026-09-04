import { describe, it, expect } from "vitest";
import { shouldPaintChunk } from "./terminal-replay";

describe("shouldPaintChunk", () => {
  it("always paints live output", () => {
    expect(shouldPaintChunk(false, true)).toBe(true);
    expect(shouldPaintChunk(false, false)).toBe(true);
  });

  it("drops replayed history when a persisted buffer already supplied it", () => {
    // The wedge in issue #500: the same 256KB of agent TUI redraws painted
    // twice, once from the persisted buffer and once from the ring.
    expect(shouldPaintChunk(true, true)).toBe(false);
  });

  it("paints replayed history when there is no persisted buffer", () => {
    // First run after an app reinstall, or a session created outside this
    // panel: the ring is the only scrollback that exists.
    expect(shouldPaintChunk(true, false)).toBe(true);
  });
});

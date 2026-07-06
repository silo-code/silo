import { describe, it, expect, vi, afterEach } from "vitest";
import { formatElapsed } from "./workspace-helpers";

describe("formatElapsed", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function elapsedFrom(agoMs: number): string {
    const now = new Date("2026-07-06T12:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(now);
    return formatElapsed(new Date(now.getTime() - agoMs).toISOString());
  }

  it("shows seconds under a minute", () => {
    expect(elapsedFrom(0)).toBe("0s");
    expect(elapsedFrom(5_000)).toBe("5s");
    expect(elapsedFrom(59_000)).toBe("59s");
  });

  it("switches to minutes at 60 seconds", () => {
    expect(elapsedFrom(60_000)).toBe("1m");
    expect(elapsedFrom(90_000)).toBe("1m");
    expect(elapsedFrom(59 * 60_000)).toBe("59m");
  });

  it("switches to hours at 60 minutes", () => {
    expect(elapsedFrom(60 * 60_000)).toBe("1h");
    expect(elapsedFrom(23 * 60 * 60_000)).toBe("23h");
  });

  it("switches to days at 24 hours", () => {
    expect(elapsedFrom(24 * 60 * 60_000)).toBe("1d");
    expect(elapsedFrom(3 * 24 * 60 * 60_000)).toBe("3d");
  });
});

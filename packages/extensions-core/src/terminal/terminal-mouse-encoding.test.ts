import { describe, it, expect } from "vitest";
import {
  nextMouseEncoding,
  withRestoredMouseEncoding,
} from "./terminal-mouse-encoding";

describe("nextMouseEncoding", () => {
  it("adopts an encoding on DECSET", () => {
    expect(nextMouseEncoding(null, [1006], true)).toBe(1006);
  });

  it("ignores non-encoding params, e.g. a combined tracking-mode DECSET", () => {
    expect(nextMouseEncoding(null, [1000, 1006], true)).toBe(1006);
  });

  it("switches encoding when the app re-selects a different one", () => {
    expect(nextMouseEncoding(1006, [1005], true)).toBe(1005);
  });

  it("clears the encoding on a matching DECRST", () => {
    expect(nextMouseEncoding(1006, [1006], false)).toBe(null);
  });

  it("leaves the encoding alone on a DECRST for a different mode", () => {
    expect(nextMouseEncoding(1006, [1000], false)).toBe(1006);
  });

  it("ignores an unrelated DECSET/DECRST entirely", () => {
    expect(nextMouseEncoding(1006, [2004], true)).toBe(1006);
    expect(nextMouseEncoding(1006, [2004], false)).toBe(1006);
  });
});

describe("withRestoredMouseEncoding", () => {
  it("appends the encoding's DECSET when tracking is on", () => {
    expect(withRestoredMouseEncoding("SCREEN", 1006, "vt200")).toBe(
      "SCREEN\x1b[?1006h",
    );
  });

  it("is a no-op when no encoding was ever selected", () => {
    expect(withRestoredMouseEncoding("SCREEN", null, "vt200")).toBe("SCREEN");
  });

  it("is a no-op when tracking mode is off, even with a remembered encoding", () => {
    expect(withRestoredMouseEncoding("SCREEN", 1006, "none")).toBe("SCREEN");
  });
});

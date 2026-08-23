import { describe, it, expect } from "vitest";
import {
  getTerminalProgress,
  withTerminalProgress,
  type PiAgentSettings,
} from "./pi-settings";

describe("getTerminalProgress", () => {
  it("defaults to false when unset", () => {
    expect(getTerminalProgress({})).toBe(false);
    expect(getTerminalProgress({ terminal: {} })).toBe(false);
  });

  it("reads the stored flag", () => {
    expect(
      getTerminalProgress({ terminal: { showTerminalProgress: true } }),
    ).toBe(true);
  });
});

describe("withTerminalProgress", () => {
  it("sets terminal.showTerminalProgress without clobbering other keys", () => {
    const base: PiAgentSettings = {
      theme: "dark",
      terminal: { showTerminalProgress: false },
      defaultModel: "gpt-4",
    };
    const next = withTerminalProgress(base, true);
    expect(next).toEqual({
      theme: "dark",
      terminal: { showTerminalProgress: true },
      defaultModel: "gpt-4",
    });
    expect(base.terminal?.showTerminalProgress).toBe(false);
  });

  it("creates terminal when absent", () => {
    expect(withTerminalProgress({}, true)).toEqual({
      terminal: { showTerminalProgress: true },
    });
  });

  it("can turn progress off", () => {
    expect(
      withTerminalProgress({ terminal: { showTerminalProgress: true } }, false),
    ).toEqual({ terminal: { showTerminalProgress: false } });
  });
});

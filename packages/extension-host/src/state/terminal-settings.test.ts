import { describe, it, expect } from "vitest";
import {
  DEFAULT_TERMINAL_SETTINGS,
  MIN_TERMINAL_FONT_SIZE_OFFSET,
  MAX_TERMINAL_FONT_SIZE_OFFSET,
  type TerminalSettings,
} from "./types";

describe("DEFAULT_TERMINAL_SETTINGS font fields", () => {
  it("fontFamily defaults to empty string (use platform default)", () => {
    expect(DEFAULT_TERMINAL_SETTINGS.fontFamily).toBe("");
  });

  it("fontSizeOffset defaults to 0 (original terminal feel: uiFontSize + 0.5)", () => {
    expect(DEFAULT_TERMINAL_SETTINGS.fontSizeOffset).toBe(0);
  });
});

describe("font size offset range constants", () => {
  it("range is -4 to +10", () => {
    expect(MIN_TERMINAL_FONT_SIZE_OFFSET).toBe(-4);
    expect(MAX_TERMINAL_FONT_SIZE_OFFSET).toBe(10);
  });
});

describe("persistence merge backward compat", () => {
  it("absent font fields fall back to defaults for existing users", () => {
    const persisted: Partial<TerminalSettings> = { cursorStyle: "bar" };
    const merged: TerminalSettings = {
      ...DEFAULT_TERMINAL_SETTINGS,
      ...persisted,
    };
    expect(merged.fontFamily).toBe("");
    expect(merged.fontSizeOffset).toBe(0);
  });

  it("persisted fontFamily overrides the empty default", () => {
    const persisted: Partial<TerminalSettings> = { fontFamily: "Fira Code" };
    const merged: TerminalSettings = {
      ...DEFAULT_TERMINAL_SETTINGS,
      ...persisted,
    };
    expect(merged.fontFamily).toBe("Fira Code");
  });

  it("persisted fontSizeOffset of 0 (same as UI) round-trips correctly", () => {
    const persisted: Partial<TerminalSettings> = { fontSizeOffset: 0 };
    const merged: TerminalSettings = {
      ...DEFAULT_TERMINAL_SETTINGS,
      ...persisted,
    };
    expect(merged.fontSizeOffset).toBe(0);
  });

  it("persisted positive fontSizeOffset overrides the default", () => {
    const persisted: Partial<TerminalSettings> = { fontSizeOffset: 3 };
    const merged: TerminalSettings = {
      ...DEFAULT_TERMINAL_SETTINGS,
      ...persisted,
    };
    expect(merged.fontSizeOffset).toBe(3);
  });

  it("persisted negative fontSizeOffset (terminal smaller than UI) is preserved", () => {
    const persisted: Partial<TerminalSettings> = { fontSizeOffset: -2 };
    const merged: TerminalSettings = {
      ...DEFAULT_TERMINAL_SETTINGS,
      ...persisted,
    };
    expect(merged.fontSizeOffset).toBe(-2);
  });
});

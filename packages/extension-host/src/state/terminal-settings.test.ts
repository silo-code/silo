import { describe, it, expect } from "vitest";
import {
  DEFAULT_TERMINAL_SETTINGS,
  MIN_TERMINAL_SCROLL_SENSITIVITY,
  MAX_TERMINAL_SCROLL_SENSITIVITY,
  DEFAULT_TERMINAL_SCROLL_SENSITIVITY,
  MAX_TERMINAL_FAST_SCROLL_SENSITIVITY,
  DEFAULT_TERMINAL_FAST_SCROLL_SENSITIVITY,
  type TerminalSettings,
} from "./types";

describe("DEFAULT_TERMINAL_SETTINGS scroll fields", () => {
  it("scrollSensitivity defaults to DEFAULT_TERMINAL_SCROLL_SENSITIVITY (3)", () => {
    expect(DEFAULT_TERMINAL_SETTINGS.scrollSensitivity).toBe(
      DEFAULT_TERMINAL_SCROLL_SENSITIVITY,
    );
    expect(DEFAULT_TERMINAL_SETTINGS.scrollSensitivity).toBe(3);
  });

  it("fastScrollSensitivity defaults to DEFAULT_TERMINAL_FAST_SCROLL_SENSITIVITY (5)", () => {
    expect(DEFAULT_TERMINAL_SETTINGS.fastScrollSensitivity).toBe(
      DEFAULT_TERMINAL_FAST_SCROLL_SENSITIVITY,
    );
    expect(DEFAULT_TERMINAL_SETTINGS.fastScrollSensitivity).toBe(5);
  });
});

describe("scroll sensitivity range constants", () => {
  it("scroll sensitivity min is 1", () => {
    expect(MIN_TERMINAL_SCROLL_SENSITIVITY).toBe(1);
  });

  it("scroll sensitivity max is 50", () => {
    expect(MAX_TERMINAL_SCROLL_SENSITIVITY).toBe(50);
  });

  it("fast scroll sensitivity max is 50", () => {
    expect(MAX_TERMINAL_FAST_SCROLL_SENSITIVITY).toBe(50);
  });

  it("default scroll sensitivity is within range", () => {
    expect(DEFAULT_TERMINAL_SCROLL_SENSITIVITY).toBeGreaterThanOrEqual(
      MIN_TERMINAL_SCROLL_SENSITIVITY,
    );
    expect(DEFAULT_TERMINAL_SCROLL_SENSITIVITY).toBeLessThanOrEqual(
      MAX_TERMINAL_SCROLL_SENSITIVITY,
    );
  });

  it("default fast scroll sensitivity is within range", () => {
    expect(DEFAULT_TERMINAL_FAST_SCROLL_SENSITIVITY).toBeGreaterThanOrEqual(
      MIN_TERMINAL_SCROLL_SENSITIVITY,
    );
    expect(DEFAULT_TERMINAL_FAST_SCROLL_SENSITIVITY).toBeLessThanOrEqual(
      MAX_TERMINAL_FAST_SCROLL_SENSITIVITY,
    );
  });
});

describe("persistence merge backward compat", () => {
  it("absent scroll fields fall back to defaults for existing users", () => {
    const persisted: Partial<TerminalSettings> = { cursorStyle: "bar" };
    const merged: TerminalSettings = {
      ...DEFAULT_TERMINAL_SETTINGS,
      ...persisted,
    };
    expect(merged.scrollSensitivity).toBe(DEFAULT_TERMINAL_SCROLL_SENSITIVITY);
    expect(merged.fastScrollSensitivity).toBe(
      DEFAULT_TERMINAL_FAST_SCROLL_SENSITIVITY,
    );
  });

  it("persisted scrollSensitivity overrides the default", () => {
    const persisted: Partial<TerminalSettings> = { scrollSensitivity: 10 };
    const merged: TerminalSettings = {
      ...DEFAULT_TERMINAL_SETTINGS,
      ...persisted,
    };
    expect(merged.scrollSensitivity).toBe(10);
  });

  it("persisted fastScrollSensitivity overrides the default", () => {
    const persisted: Partial<TerminalSettings> = {
      fastScrollSensitivity: 20,
    };
    const merged: TerminalSettings = {
      ...DEFAULT_TERMINAL_SETTINGS,
      ...persisted,
    };
    expect(merged.fastScrollSensitivity).toBe(20);
  });
});

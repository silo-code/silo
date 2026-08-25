import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  clearFocusedTerminal,
  registerTerminalClear,
  setTerminalFocus,
} from "./terminal-clear-registry";
import { contextKeys, setContextKey } from "./context-keys";

beforeEach(() => {
  setContextKey("activeEditorId", null);
  setContextKey("activeEditorViewId", null);
  setTerminalFocus(null);
});

describe("terminal-clear-registry", () => {
  it("clears the focused terminal when its handler is registered", () => {
    const clear = vi.fn();
    const sub = registerTerminalClear("term_1", clear);
    setTerminalFocus("term_1");

    expect(clearFocusedTerminal()).toBe(true);
    expect(clear).toHaveBeenCalledTimes(1);

    sub.dispose();
  });

  it("no-ops when no terminal textarea is focused", () => {
    const clear = vi.fn();
    registerTerminalClear("term_1", clear);

    expect(clearFocusedTerminal()).toBe(false);
    expect(clear).not.toHaveBeenCalled();
    expect(contextKeys.terminalFocused).toBe(false);
  });

  it("no-ops when focus moved elsewhere before clear", () => {
    const clear = vi.fn();
    registerTerminalClear("term_1", clear);
    setTerminalFocus("term_1");
    setTerminalFocus(null);

    expect(clearFocusedTerminal()).toBe(false);
    expect(clear).not.toHaveBeenCalled();
  });

  it("clears focus state when the focused panel unmounts", () => {
    const sub = registerTerminalClear("term_1", vi.fn());
    setTerminalFocus("term_1");

    sub.dispose();

    expect(contextKeys.terminalFocused).toBe(false);
  });
});

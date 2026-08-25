import type { Disposable } from "@silo-code/sdk";
import { contextKeys, setContextKey } from "./context-keys";

type ClearFn = () => void;

const clearHandlers = new Map<string, ClearFn>();
let focusedTerminalId: string | null = null;

/**
 * Publish terminal textarea focus for the given record id (or `null` on blur).
 * Drives the `terminalFocused` context key used by the Clear keybinding's
 * `when` clause.
 */
export function setTerminalFocus(terminalId: string | null): void {
  focusedTerminalId = terminalId;
  setContextKey("terminalFocused", terminalId !== null);
}

/** Register a terminal panel's clear action. Disposed on unmount. */
export function registerTerminalClear(
  terminalId: string,
  clear: ClearFn,
): Disposable {
  clearHandlers.set(terminalId, clear);
  return {
    dispose: () => {
      clearHandlers.delete(terminalId);
      if (focusedTerminalId === terminalId) setTerminalFocus(null);
    },
  };
}

/** Clear the terminal whose xterm textarea is focused, if any. */
export function clearFocusedTerminal(): boolean {
  if (!contextKeys.terminalFocused || !focusedTerminalId) return false;
  const clear = clearHandlers.get(focusedTerminalId);
  if (!clear) return false;
  clear();
  return true;
}

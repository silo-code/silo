import { Registry } from "./registry";
import { executeCommand } from "./commands";
import { contextKeys } from "./context-keys";
import { menuItemRegistry } from "./menu-items";
import {
  clearKeybindingDefaults,
  isRemoved,
  overrideKey,
  recordKeybindingDefault,
} from "./keymap";
import type { Keybinding } from "@silo-code/sdk";

export const keybindingRegistry = new Registry<Keybinding>();

// Mirror registry-declared default keys into the keymap so they surface in the
// keybindings UI (which resolves each command's key via the keymap's
// effectiveKey). Rebuilt on every registry change so stale entries don't linger
// — the same shape as the menu builder feeding menuDefaults.
function syncKeybindingDefaults(): void {
  clearKeybindingDefaults();
  for (const b of keybindingRegistry.list()) {
    recordKeybindingDefault(b.command, b.key);
  }
}
keybindingRegistry.onChange(syncKeybindingDefaults);

function commandHasMenuItem(command: string): boolean {
  return menuItemRegistry.list().some((i) => i.command === command);
}

interface ParsedKey {
  meta: boolean;
  ctrl: boolean;
  shift: boolean;
  alt: boolean;
  /** KeyboardEvent.code value, e.g. "KeyS", "Digit1", "Equal", "F1". */
  code: string;
}

const KEY_ALIASES: Record<string, string> = {
  "=": "Equal",
  "+": "Equal",
  "-": "Minus",
  _: "Minus",
  "[": "BracketLeft",
  "]": "BracketRight",
  "\\": "Backslash",
  ";": "Semicolon",
  "'": "Quote",
  ",": "Comma",
  ".": "Period",
  "/": "Slash",
  "`": "Backquote",
  // Named keys — specs are lowercased before lookup, so the event's `code`
  // (e.g. "ArrowLeft") must be spelled out here; passing it through verbatim
  // would never match. Both the short ("left") and full ("arrowleft") forms.
  left: "ArrowLeft",
  right: "ArrowRight",
  up: "ArrowUp",
  down: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
  arrowup: "ArrowUp",
  arrowdown: "ArrowDown",
  pageup: "PageUp",
  pagedown: "PageDown",
  home: "Home",
  end: "End",
};

function tokenToCode(token: string): string {
  if (KEY_ALIASES[token]) return KEY_ALIASES[token];
  if (token.length === 1) {
    if (/[a-z]/i.test(token)) return `Key${token.toUpperCase()}`;
    if (/[0-9]/.test(token)) return `Digit${token}`;
  }
  // Already a code-like name ("F1", "Escape", "Enter", "Space").
  return token;
}

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform);

const parseCache = new Map<string, ParsedKey>();

function parseKey(spec: string): ParsedKey {
  const cached = parseCache.get(spec);
  if (cached) return cached;
  const parts = spec.toLowerCase().split("+");
  // The last token is the key; everything before is a modifier.
  const key = parts.pop() ?? "";
  const primaryAlias =
    parts.includes("cmdorctrl") || parts.includes("commandorcontrol");
  const parsed: ParsedKey = {
    meta:
      parts.includes("cmd") ||
      parts.includes("meta") ||
      parts.includes("super") ||
      (isMac && primaryAlias),
    ctrl:
      parts.includes("ctrl") ||
      parts.includes("control") ||
      (!isMac && primaryAlias),
    shift: parts.includes("shift"),
    alt: parts.includes("alt") || parts.includes("option"),
    code: tokenToCode(key),
  };
  parseCache.set(spec, parsed);
  return parsed;
}

function matches(p: ParsedKey, e: KeyboardEvent): boolean {
  return (
    p.meta === e.metaKey &&
    p.ctrl === e.ctrlKey &&
    p.shift === e.shiftKey &&
    p.alt === e.altKey &&
    p.code === e.code
  );
}

/**
 * Try to dispatch a keydown event against the keybinding registry. Returns
 * true and preventDefault/stopPropagations the event if a matching binding's
 * command was executed. Returns false if no binding matched, so callers can
 * fall through to other handling.
 */
export function dispatchKey(e: KeyboardEvent): boolean {
  for (const binding of keybindingRegistry.list()) {
    // Menu-homed commands dispatch via their native menu accelerator (which the
    // menu builder sources from the keymap); skip them here to avoid double-fire.
    if (commandHasMenuItem(binding.command)) continue;
    if (isRemoved(binding.command)) continue;
    if (binding.when && !binding.when(contextKeys)) continue;
    const effKey = overrideKey(binding.command) ?? binding.key;
    if (!matches(parseKey(effKey), e)) continue;
    // Dispatched on the capture phase (see Shortcuts.tsx): stop here so the
    // event never reaches a focused widget that binds the same chord (e.g.
    // Monaco's Cmd+Alt+↑/↓ multi-cursor).
    e.preventDefault();
    e.stopPropagation();
    executeCommand(binding.command);
    return true;
  }
  return false;
}

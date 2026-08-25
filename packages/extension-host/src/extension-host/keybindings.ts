import { Registry } from "./registry";
import { executeCommand } from "./commands";
import { contextKeys } from "./context-keys";
import { menuItemRegistry } from "./menu-items";
import {
  clearKeybindingDefaults,
  isKeybindingCaptureActive,
  isRemoved,
  overrideEntries,
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
  // Function keys: specs are lowercased before this runs ("F5" → "f5"), but the
  // event's `code` is "F5" — without this they could never match.
  if (/^f\d{1,2}$/.test(token)) return token.toUpperCase();
  // Already a code-like name ("Escape", "Enter", "Space").
  return token;
}

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform);

/**
 * Every spelling of the **primary** modifier — Cmd on macOS, Ctrl everywhere
 * else. `normalizeKey` (keymap.ts) folds all of these to the single stored
 * token `cmd`, `displayKey` renders that token as "Cmd"/"Ctrl" per platform,
 * and `toTauriAccelerator` emits it as `CmdOrCtrl` for the native menu — so the
 * parser has to make the same platform choice. Reading `cmd` as a literal
 * metaKey off-Mac is what left every JS-dispatched default (tab cycling,
 * workspace cycling, Find in Files) demanding the physical **Windows key**,
 * while the Shortcuts page advertised the Ctrl chord that could never fire.
 * `ctrl` stays literal on every platform — Ctrl is its own modifier on macOS.
 */
const PRIMARY_MODIFIERS = [
  "cmd",
  "command",
  "cmdorctrl",
  "commandorcontrol",
  "meta",
  "super",
];

const parseCache = new Map<string, ParsedKey>();

/** @internal — exported for tests, which pin `mac` to cover both platforms. */
export function parseKeySpec(spec: string, mac: boolean): ParsedKey {
  const parts = spec.toLowerCase().split("+");
  // The last token is the key; everything before is a modifier.
  const key = parts.pop() ?? "";
  const primary = PRIMARY_MODIFIERS.some((m) => parts.includes(m));
  return {
    meta: mac && primary,
    ctrl:
      parts.includes("ctrl") || parts.includes("control") || (!mac && primary),
    shift: parts.includes("shift"),
    alt: parts.includes("alt") || parts.includes("option"),
    code: tokenToCode(key),
  };
}

function parseKey(spec: string): ParsedKey {
  const cached = parseCache.get(spec);
  if (cached) return cached;
  const parsed = parseKeySpec(spec, isMac);
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
  if (isKeybindingCaptureActive()) return false;
  const bindings = keybindingRegistry.list();
  for (const binding of bindings) {
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
  return dispatchOverrideOnly(e, bindings);
}

/**
 * Dispatch a user override on a command that declared **no** default key.
 * The Keyboard Shortcuts page lets any command be bound, so such a command has
 * no registry entry to iterate above and (with no menu item) no native
 * accelerator either — keybindings.json is the only record of the chord.
 */
function dispatchOverrideOnly(
  e: KeyboardEvent,
  bindings: readonly Keybinding[],
): boolean {
  for (const [command, key] of overrideEntries()) {
    if (bindings.some((b) => b.command === command)) continue;
    if (commandHasMenuItem(command)) continue;
    if (isRemoved(command)) continue;
    if (!matches(parseKey(key), e)) continue;
    e.preventDefault();
    e.stopPropagation();
    executeCommand(command);
    return true;
  }
  return false;
}

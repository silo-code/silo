// The keymap: single source of truth for command → key, composed of
// extension-declared defaults and user overrides from keybindings.json.
//
// Each command is dispatched by exactly ONE mechanism, so nothing double-fires:
//   - menu-homed commands fire via their native menu accelerator, which the
//     menu builder sources from the effective key here;
//   - everything else fires through `dispatchKey` (keybindings.ts), which also
//     reads effective keys here.
//
// Keys are stored in a normalized "cmd+shift+s" form. Converters bridge to the
// Tauri accelerator form ("CmdOrCtrl+Shift+S") used by the native menu.

import { fsReadText } from "../services/tauri-fs";
import { startWatch, onFileChange } from "../services/tauri-watch";
import { userConfigDir, userConfigPath } from "../services/user-config";
import type { Disposable } from "@silo-code/sdk";

export interface UserBinding {
  key: string;
  /** Command id. Prefix with "-" to unbind a default (VS Code convention). */
  command: string;
}

// ── normalization ──────────────────────────────────────────────────────────

const MOD_ALIASES: Record<string, "cmd" | "ctrl" | "alt" | "shift"> = {
  cmd: "cmd",
  command: "cmd",
  cmdorctrl: "cmd",
  commandorcontrol: "cmd",
  meta: "cmd",
  super: "cmd",
  ctrl: "ctrl",
  control: "ctrl",
  alt: "alt",
  option: "alt",
  opt: "alt",
  shift: "shift",
};

const MOD_ORDER: ReadonlyArray<"cmd" | "ctrl" | "alt" | "shift"> = [
  "cmd",
  "ctrl",
  "alt",
  "shift",
];

/** Normalize any accepted spec ("CmdOrCtrl+Shift+S", "cmd+b") → "cmd+shift+s". */
export function normalizeKey(spec: string): string {
  const parts = spec.trim().split("+");
  const key = (parts.pop() ?? "").toLowerCase();
  const mods = new Set<"cmd" | "ctrl" | "alt" | "shift">();
  for (const p of parts) {
    const m = MOD_ALIASES[p.trim().toLowerCase()];
    if (m) mods.add(m);
  }
  const ordered = MOD_ORDER.filter((m) => mods.has(m));
  return [...ordered, key].join("+");
}

/** Convert a normalized key ("cmd+shift+s") → Tauri accelerator ("CmdOrCtrl+Shift+S"). */
export function toTauriAccelerator(norm: string): string {
  const parts = norm.split("+");
  const key = parts.pop() ?? "";
  const out: string[] = [];
  for (const p of parts) {
    if (p === "cmd") out.push("CmdOrCtrl");
    else if (p === "ctrl") out.push("Ctrl");
    else if (p === "alt") out.push("Alt");
    else if (p === "shift") out.push("Shift");
  }
  let k = key;
  if (/^[a-z]$/.test(k)) k = k.toUpperCase();
  else if (/^f\d+$/.test(k)) k = k.toUpperCase();
  out.push(k);
  return out.join("+");
}

/** Human-facing label for the UI — text abbreviations ("Cmd+Opt+PgDn"). */
const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.platform);

// Readable names for non-printable keys in the shortcuts UI. Both the short
// ("down") and code-like ("arrowdown") spellings map to the same label, since
// either form is accepted in a binding spec.
const KEY_LABELS: Record<string, string> = {
  down: "Down",
  up: "Up",
  left: "Left",
  right: "Right",
  arrowdown: "Down",
  arrowup: "Up",
  arrowleft: "Left",
  arrowright: "Right",
  pageup: "PgUp",
  pagedown: "PgDn",
  home: "Home",
  end: "End",
  enter: "Enter",
  escape: "Esc",
  space: "Space",
  tab: "Tab",
};

/** Platform-appropriate modifier name (Mac uses Cmd/Opt; elsewhere Ctrl/Alt). */
function modLabel(p: string): string {
  switch (p) {
    case "cmd":
      return isMac ? "Cmd" : "Ctrl";
    case "ctrl":
      return "Ctrl";
    case "alt":
      return isMac ? "Opt" : "Alt";
    case "shift":
      return "Shift";
    default:
      return p;
  }
}

export function displayKey(norm: string): string {
  const parts = norm.split("+");
  const key = parts.pop() ?? "";
  const k =
    KEY_LABELS[key] ??
    (key.length === 1
      ? key.toUpperCase()
      : key.charAt(0).toUpperCase() + key.slice(1));
  return [...parts.map(modLabel), k].join("+");
}

// ── state ────────────────────────────────────────────────────────────────

let overrides = new Map<string, string>(); // command → normalized key
let removed = new Set<string>(); // commands the user unbound
const menuDefaults = new Map<string, string>(); // command → normalized key (from menu accelerators)
const keybindingDefaults = new Map<string, string>(); // command → normalized key (from registerKeybinding)

const listeners = new Set<() => void>();
function emit(): void {
  for (const l of listeners) l();
}

export function onKeymapChange(fn: () => void): Disposable {
  listeners.add(fn);
  return { dispose: () => listeners.delete(fn) };
}

/** Record an extension-declared default (called by the menu builder per item). */
export function recordMenuDefault(command: string, accelerator: string): void {
  menuDefaults.set(command, normalizeKey(accelerator));
}

/** Cleared and rebuilt on every menu sync so stale entries don't linger. */
export function clearMenuDefaults(): void {
  menuDefaults.clear();
}

/**
 * Record an extension-declared default from {@link registerKeybinding}. The
 * menu builder records menu-homed commands via {@link recordMenuDefault}; this
 * is the equivalent source for commands bound purely through a keybinding (no
 * menu item), so they surface in the keybindings UI with their key.
 */
export function recordKeybindingDefault(command: string, key: string): void {
  keybindingDefaults.set(command, normalizeKey(key));
}

/** Cleared and rebuilt whenever the keybinding registry changes. */
export function clearKeybindingDefaults(): void {
  keybindingDefaults.clear();
}

export function isRemoved(command: string): boolean {
  return removed.has(command);
}

export function overrideKey(command: string): string | undefined {
  return overrides.get(command);
}

/** Effective key = override ?? default, unless the user unbound it. */
export function effectiveKey(command: string): string | undefined {
  if (removed.has(command)) return undefined;
  return (
    overrides.get(command) ??
    menuDefaults.get(command) ??
    keybindingDefaults.get(command)
  );
}

/** Snapshot of every command that has a default, with its effective key. */
export function defaultEntries(): { command: string; key: string }[] {
  const commands = new Set([
    ...menuDefaults.keys(),
    ...keybindingDefaults.keys(),
  ]);
  return [...commands].map((command) => ({
    command,
    key: effectiveKey(command) ?? "",
  }));
}

export function setUserBindings(list: UserBinding[]): void {
  overrides = new Map();
  removed = new Set();
  for (const b of list) {
    if (typeof b?.command !== "string" || typeof b?.key !== "string") continue;
    if (b.command.startsWith("-")) {
      removed.add(b.command.slice(1));
      continue;
    }
    overrides.set(b.command, normalizeKey(b.key));
  }
  emit();
}

// ── keybindings.json ───────────────────────────────────────────────────────

export async function keybindingsPath(): Promise<string> {
  return userConfigPath("keybindings.json");
}

/** Tolerant JSONC parse: strips line and block comments plus trailing commas. */
function parseJsonc(text: string): unknown {
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const noLine = noBlock.replace(/(^|[^:])\/\/.*$/gm, "$1");
  const noTrailingCommas = noLine.replace(/,(\s*[}\]])/g, "$1");
  return JSON.parse(noTrailingCommas);
}

export async function loadUserKeybindings(): Promise<void> {
  try {
    const text = await fsReadText(await keybindingsPath());
    const data = parseJsonc(text);
    setUserBindings(Array.isArray(data) ? (data as UserBinding[]) : []);
  } catch {
    // Missing or invalid → no overrides. (A malformed file simply has no effect.)
    setUserBindings([]);
  }
}

/** Load once, then live-reload whenever keybindings.json changes on disk. */
export async function initUserKeybindings(): Promise<void> {
  await loadUserKeybindings();
  try {
    const dir = await userConfigDir();
    await startWatch("keybindings", dir);
    await onFileChange((evt) => {
      if (evt.watchId !== "keybindings") return;
      if (evt.paths.some((p) => p.endsWith("keybindings.json"))) {
        void loadUserKeybindings();
      }
    });
  } catch (err) {
    console.warn("[keymap] live-reload watch failed", err);
  }
}

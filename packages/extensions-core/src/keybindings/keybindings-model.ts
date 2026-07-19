import type { Command, MenuId } from "@silo-code/sdk";

/** Persisted user override / unbind entry (same shape as keybindings.json). */
export interface UserBinding {
  key: string;
  /** Command id. Prefix with "-" to unbind a default. */
  command: string;
}

export type KeybindingRowState = "default" | "override" | "unbound" | "none";

export type CaptureParseResult =
  | { kind: "cancel" }
  | { kind: "ignore" }
  | { kind: "confirm" }
  | { kind: "chord"; key: string };

const MENU_GROUP_LABELS: Record<MenuId, string> = {
  file: "File",
  edit: "Edit",
  view: "View",
  window: "Window",
  help: "Help",
};

const CODE_TO_TOKEN: Record<string, string> = {
  Equal: "=",
  Minus: "-",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Semicolon: ";",
  Quote: "'",
  Comma: ",",
  Period: ".",
  Slash: "/",
  Backquote: "`",
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  PageUp: "pageup",
  PageDown: "pagedown",
  Home: "home",
  End: "end",
  Enter: "enter",
  Space: "space",
  Tab: "tab",
  Escape: "escape",
  Backspace: "backspace",
  Delete: "delete",
};

const MODIFIER_CODES = new Set([
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
]);

export function humanize(segment: string): string {
  return segment
    .replace(/[-_]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(" ")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Buckets a command for the Keybindings settings page. Commands carry no
 * category of their own, so this is derived from the id's "area.verb"
 * convention. "core"/"silo" are generic owner namespaces (not functional
 * areas), so those fall back to their sub-namespace ("silo.git.x" → Git) or,
 * for flat ids with no sub-namespace, to wherever the command is homed in
 * the native menu. What's left after that lands in "General".
 */
export function groupFor(
  command: Command,
  menuFor: (commandId: string) => MenuId | undefined,
): string {
  const parts = command.id.split(".");
  const ns = parts[0];
  if (ns !== "core" && ns !== "silo") return humanize(ns);
  if (parts.length >= 3) {
    // Keep CLI as an acronym; it's a small utility group pinned to the end.
    if (parts[1] === "cli") return "CLI";
    return humanize(parts[1]);
  }
  const menu = menuFor(command.id);
  return menu ? MENU_GROUP_LABELS[menu] : "General";
}

/**
 * Groups and orders commands for display. "General" is last among ordinary
 * buckets; "CLI" is pinned after that (install/PATH utilities, not day-to-day).
 */
export function groupCommands(
  commands: Command[],
  menuFor: (commandId: string) => MenuId | undefined,
): Array<[string, Command[]]> {
  const groups = new Map<string, Command[]>();
  for (const c of commands) {
    const key = groupFor(c, menuFor);
    const bucket = groups.get(key);
    if (bucket) bucket.push(c);
    else groups.set(key, [c]);
  }
  return [...groups.entries()].sort(([a], [b]) => {
    const rank = (name: string) =>
      name === "CLI" ? 2 : name === "General" ? 1 : 0;
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    return a.localeCompare(b);
  });
}

/** Which visual state a Keyboard Shortcuts row should use. */
export function rowState(opts: {
  unbound: boolean;
  overrideKey?: string;
  defaultKey?: string;
  effectiveKey?: string;
}): KeybindingRowState {
  if (opts.unbound) return "unbound";
  if (opts.overrideKey !== undefined) return "override";
  if (opts.effectiveKey !== undefined || opts.defaultKey !== undefined) {
    return "default";
  }
  return "none";
}

/**
 * Parse a keydown during capture / reassign-confirm.
 * Escape always cancels; Enter confirms a pending reassign; modifier-only
 * presses are ignored; anything else becomes a normalized chord.
 */
export function parseCaptureKeydown(
  e: {
    key: string;
    code: string;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
  },
  opts: { confirming: boolean },
): CaptureParseResult {
  if (e.key === "Escape" || e.code === "Escape") return { kind: "cancel" };
  if (opts.confirming && (e.key === "Enter" || e.code === "Enter")) {
    return { kind: "confirm" };
  }
  if (MODIFIER_CODES.has(e.code)) return { kind: "ignore" };

  const token = codeToToken(e.code);
  if (!token) return { kind: "ignore" };

  const mods: string[] = [];
  if (e.metaKey) mods.push("cmd");
  if (e.ctrlKey) mods.push("ctrl");
  if (e.altKey) mods.push("alt");
  if (e.shiftKey) mods.push("shift");
  return { kind: "chord", key: [...mods, token].join("+") };
}

function codeToToken(code: string): string | null {
  if (CODE_TO_TOKEN[code]) return CODE_TO_TOKEN[code];
  if (code.startsWith("Key") && code.length === 4) {
    return code.slice(3).toLowerCase();
  }
  if (code.startsWith("Digit") && code.length === 6) return code.slice(5);
  if (/^F\d{1,2}$/.test(code)) return code.toLowerCase();
  return null;
}

/** Commands (other than `commandId`) whose effective key equals `key`. */
export function conflictingCommands(
  key: string,
  commandId: string,
  entries: ReadonlyArray<{ command: string; effectiveKey?: string }>,
): string[] {
  return entries
    .filter((e) => e.command !== commandId && e.effectiveKey === key)
    .map((e) => e.command);
}

function bindingsToMaps(list: UserBinding[]): {
  overrides: Map<string, string>;
  removed: Set<string>;
} {
  const overrides = new Map<string, string>();
  const removed = new Set<string>();
  for (const b of list) {
    if (typeof b?.command !== "string" || typeof b?.key !== "string") continue;
    if (b.command.startsWith("-")) {
      removed.add(b.command.slice(1));
      continue;
    }
    overrides.set(b.command, b.key);
  }
  return { overrides, removed };
}

function mapsToBindings(
  overrides: Map<string, string>,
  removed: Set<string>,
): UserBinding[] {
  const list: UserBinding[] = [];
  for (const [command, key] of [...overrides.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    list.push({ command, key });
  }
  for (const command of [...removed].sort()) {
    list.push({ command: `-${command}`, key: "" });
  }
  return list;
}

function effectiveOf(
  command: string,
  overrides: Map<string, string>,
  removed: Set<string>,
  defaults: ReadonlyMap<string, string>,
): string | undefined {
  if (removed.has(command)) return undefined;
  return overrides.get(command) ?? defaults.get(command);
}

/**
 * Set `command`'s override to `key`, reassigning (unbinding) every id in
 * `reassignFrom` so they no longer hold that chord.
 */
export function bindingsAfterSet(
  current: UserBinding[],
  command: string,
  key: string,
  reassignFrom: readonly string[],
  defaults: ReadonlyMap<string, string>,
): UserBinding[] {
  const { overrides, removed } = bindingsToMaps(current);
  overrides.delete(command);
  removed.delete(command);
  overrides.set(command, key);

  for (const other of reassignFrom) {
    if (other === command) continue;
    freeKey(other, key, overrides, removed, defaults);
  }
  return mapsToBindings(overrides, removed);
}

/** Drop the override so the command returns to its default (or stays unbound). */
export function bindingsAfterReset(
  current: UserBinding[],
  command: string,
): UserBinding[] {
  const { overrides, removed } = bindingsToMaps(current);
  overrides.delete(command);
  removed.delete(command);
  return mapsToBindings(overrides, removed);
}

/** Make the command unbound — no chord, even if a default existed. */
export function bindingsAfterRemove(
  current: UserBinding[],
  command: string,
): UserBinding[] {
  const { overrides, removed } = bindingsToMaps(current);
  overrides.delete(command);
  removed.add(command);
  return mapsToBindings(overrides, removed);
}

function freeKey(
  command: string,
  key: string,
  overrides: Map<string, string>,
  removed: Set<string>,
  defaults: ReadonlyMap<string, string>,
): void {
  const override = overrides.get(command);
  if (override === key) {
    overrides.delete(command);
    if (defaults.get(command) === key) removed.add(command);
    else removed.delete(command);
    return;
  }
  if (effectiveOf(command, overrides, removed, defaults) === key) {
    overrides.delete(command);
    removed.add(command);
  }
}

/** Filter Keyboard Shortcuts rows by label, id, or key. */
export function commandMatchesQuery(
  query: string,
  command: { id: string; label: string },
  keyInfo: { effective?: string; display?: string },
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (command.label.toLowerCase().includes(q)) return true;
  if (command.id.toLowerCase().includes(q)) return true;

  const compact = q.replace(/\s+/g, "");
  const aliased = compact
    .replace(/⌘/g, "cmd")
    .replace(/cmdorctrl/g, "cmd")
    .replace(/commandorcontrol/g, "cmd")
    .replace(/command/g, "cmd")
    .replace(/meta/g, "cmd")
    .replace(/super/g, "cmd")
    .replace(/⌥/g, "alt")
    .replace(/option/g, "alt")
    .replace(/opt/g, "alt")
    .replace(/control/g, "ctrl")
    .replace(/⇧/g, "shift");

  if (keyInfo.effective) {
    if (keyInfo.effective.includes(q) || keyInfo.effective.includes(compact)) {
      return true;
    }
    if (keyInfo.effective.includes(aliased)) return true;
  }
  if (keyInfo.display) {
    const d = keyInfo.display.toLowerCase();
    if (d.includes(q) || d.replace(/\s+/g, "").includes(compact)) return true;
  }
  return false;
}

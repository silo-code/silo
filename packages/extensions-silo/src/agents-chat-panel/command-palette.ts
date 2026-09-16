/**
 * The composer's `/` palette (RFC 0040) — a data-surface consumer, not a
 * redesign: a filtered list on `/`, pick one, insert its name. Pure so the
 * matching logic is unit-tested independent of the `Textarea` it drives.
 */

import type { AgentCommand } from "@silo-code/sdk";

/**
 * The palette's query, when the draft is currently *authoring* a command
 * name — `/` at the very start of the draft, nothing after it but the name
 * so far. `undefined` once a space (or anything else) follows the `/`: at
 * that point the user is typing the command's argument, not choosing one.
 */
export function commandQueryFromDraft(draft: string): string | undefined {
  const match = /^\/(\S*)$/.exec(draft);
  return match?.[1];
}

/**
 * The one command name **this panel reserves** (RFC 0048, ADR 0054). `clear`
 * means the same thing here whatever agent is on the other end — a **session
 * reset** — so the palette shows our entry and the composer answers a typed
 * `/clear` itself; the agent never sees it.
 *
 * The reservation is this panel's, not the platform's: `ctx.agents` hands
 * every consumer the agent's command list unchanged, and another Chat UI on
 * that surface forwards `clear` like any other command.
 *
 * Shadowing a name the agent owns needs a justification, and this one is
 * narrow on purpose: Silo's reset does everything an agent's own `/clear`
 * does (a fresh agent context) **and** discards the transcript journal
 * underneath it. Nothing is hidden — a superset replaces a subset. A future
 * reservation has to clear that same bar; this is a reserved name, not an
 * open namespace.
 */
export const RESERVED_CLEAR: AgentCommand = {
  name: "clear",
  description: "Start a new session and discard this conversation",
};

/**
 * The agent's commands with this panel's `clear` in place of the agent's — and
 * appended when the agent advertises none, since a typed `/clear` works
 * regardless and a palette that omitted it would hide a command the composer
 * honors. Every other command keeps its place in the agent's own order.
 */
export function withReservedCommands(
  commands: readonly AgentCommand[],
): readonly AgentCommand[] {
  let substituted = false;
  const out = commands.map((c) => {
    if (c.name.toLowerCase() !== RESERVED_CLEAR.name) return c;
    substituted = true;
    return RESERVED_CLEAR;
  });
  return substituted ? out : [...out, RESERVED_CLEAR];
}

/**
 * Whether a composer draft is the reserved `/clear` — exactly that, with
 * surrounding whitespace ignored.
 *
 * An argument (`/clear the decks`) is deliberately **not** reserved: Silo's
 * reset takes none, and swallowing the rest of the line would discard text
 * the user typed. That goes to the agent as it always did.
 */
export function isReservedDraft(draft: string): boolean {
  return draft.trim() === `/${RESERVED_CLEAR.name}`;
}

/**
 * The Clear Session shortcut — ⌘⇧K on macOS, Ctrl+Shift+K elsewhere. Takes the
 * fields it reads and the platform flag rather than a `KeyboardEvent` and a
 * `navigator` sniff, the same shape as `isLinkActivationClick`, so it is
 * unit-tested without a DOM.
 *
 * **Shift is required.** The plain ⌘K this started as is the terminal's
 * scrollback-clear keystroke on every platform and a near-universal "clear the
 * view" reflex — far too light a touch for a gesture that ends the session and
 * deletes the transcript. The shifted variant is the app's own binding and is
 * unclaimed elsewhere.
 */
export function isClearShortcut(
  event: {
    key: string;
    metaKey: boolean;
    ctrlKey: boolean;
    shiftKey: boolean;
  },
  isMac: boolean,
): boolean {
  if (event.key.toLowerCase() !== "k") return false;
  if (!event.shiftKey) return false;
  return isMac ? event.metaKey : event.ctrlKey;
}

/**
 * The menu accelerator label for {@link isClearShortcut}. The panel's own
 * label convention — glyphs on macOS, `+`-joined words elsewhere — rather than
 * the host keymap's `displayKey`, because this binding is a DOM handler and
 * not in the keymap at all (RFC 0048; the exit is issue #537).
 */
export function clearShortcutLabel(isMac: boolean): string {
  return isMac ? "⌘⇧K" : "Ctrl+Shift+K";
}

/** Commands whose name starts with `query`, case-insensitively, in the
 *  agent's own order. */
export function filterCommands(
  commands: readonly AgentCommand[],
  query: string,
): readonly AgentCommand[] {
  const q = query.toLowerCase();
  return commands.filter((c) => c.name.toLowerCase().startsWith(q));
}

/** The draft after picking `command` from the palette — its name, `/`-prefixed
 *  and space-terminated, ready for an argument the command's `input.hint`
 *  (if any) can prompt for via the `Textarea`'s placeholder. */
export function draftAfterCommandPick(command: AgentCommand): string {
  return `/${command.name} `;
}

/** Keys the textarea steals while the palette is open, so ↑/↓/Enter/Tab don't
 *  move the caret, send, or shift focus. */
export type PaletteNavAction = "up" | "down" | "pick" | "dismiss";

export function paletteNavAction(
  key: string,
  shiftKey: boolean,
): PaletteNavAction | undefined {
  if (key === "ArrowDown") return "down";
  if (key === "ArrowUp") return "up";
  if (key === "Enter" && !shiftKey) return "pick";
  if (key === "Tab") return "pick";
  if (key === "Escape") return "dismiss";
  return undefined;
}

export function stepPaletteIndex(
  index: number,
  direction: "up" | "down",
  count: number,
): number {
  if (count <= 0) return 0;
  if (direction === "down") return (index + 1) % count;
  return (index - 1 + count) % count;
}

export function clampPaletteIndex(index: number, count: number): number {
  if (count <= 0) return 0;
  if (index < 0) return 0;
  if (index >= count) return count - 1;
  return index;
}

/** Row title: `skill:code-review` → `Code Review`, `compact` → `Compact`.
 *  Display only — the value sent is still {@link AgentCommand.name}. */
export function commandDisplayTitle(name: string): string {
  const stripped = name.replace(/^skill:/i, "");
  return stripped
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

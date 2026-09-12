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

/** Keys the textarea steals while the palette is open, so ↑/↓/Enter don't
 *  move the caret or send. */
export type PaletteNavAction = "up" | "down" | "pick" | "dismiss";

export function paletteNavAction(
  key: string,
  shiftKey: boolean,
): PaletteNavAction | undefined {
  if (key === "ArrowDown") return "down";
  if (key === "ArrowUp") return "up";
  if (key === "Enter" && !shiftKey) return "pick";
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

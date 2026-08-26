import type { IconMode } from "./settings-store";
import { agentIconFor } from "./agent-icons";

/**
 * A row/tab's agent brand icon, or `null` when `mode` is `"none"` or no icon
 * is known for this agent (see `agent-icons.ts`). Shared between the Agents
 * panel's rows and the CenterDock terminal-tab leading icon (`ctx.terminals
 * .bindIcon`) so both read the same setting the same way.
 *
 * "color" tints the glyph with the brand's own hex via inline `style`;
 * "monotone" leaves `color` unset so it inherits whatever the caller's CSS
 * sets on an ancestor (the Agents panel points it at `--silo-color-text-hi`;
 * the CenterDock tab is sized/positioned entirely by host chrome, which also
 * supplies its own icon color via `currentColor` inheritance).
 */
export function AgentIconGlyph({
  agentId,
  mode,
  colorScheme,
  className,
}: {
  agentId: string | undefined;
  mode: IconMode;
  /** The host's active light/dark base — "color" mode picks the icon's
   * {@link AgentIcon.hexLight}/{@link AgentIcon.hexDark} accordingly, since a
   * single hex can't have enough contrast against both. */
  colorScheme: "dark" | "light";
  className?: string;
}) {
  if (mode === "none") return null;
  const icon = agentIconFor(agentId);
  if (!icon) return null;
  const hex = colorScheme === "light" ? icon.hexLight : icon.hexDark;
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      style={mode === "color" ? { color: `#${hex}` } : undefined}
      aria-hidden="true"
    >
      <path d={icon.path} fill="currentColor" fillRule={icon.fillRule} />
    </svg>
  );
}

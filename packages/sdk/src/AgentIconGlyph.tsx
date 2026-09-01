import type { AgentIcon, AgentIconMode } from "./agents-service";

/**
 * Renders a Catalog Agent's brand mark from its {@link AgentIcon} data (get one
 * from {@link AgentsService.catalog}). Data-driven on purpose — it takes the
 * icon, not an agent id, so it has no dependency on the sealed catalog and one
 * renderer serves the host `+` menu, `silo.agents`, and third-party extensions.
 *
 * Returns `null` when `mode` is `"none"` or `icon` is absent — callers that
 * gate tab chrome on "is there an icon" should check the return value, not
 * construct the element unconditionally.
 *
 * `"color"` tints the glyph with the brand's own hex (picking
 * {@link AgentIcon.hexLight} / {@link AgentIcon.hexDark} by `colorScheme`, since
 * one hex can't contrast against both a light and a dark tab strip);
 * `"monotone"` leaves `color` unset so it inherits `currentColor` from an
 * ancestor. A duotone source (OpenCode's frame + panel) layers a second
 * 40%-opacity path rather than flattening to one fill.
 *
 * @category Consumer Services
 * @public
 */
export function AgentIconGlyph({
  icon,
  mode,
  colorScheme,
  className,
}: {
  icon: AgentIcon | undefined;
  mode: AgentIconMode;
  /** The host's active light/dark base — selects `hexLight` / `hexDark` in
   *  `"color"` mode. */
  colorScheme: "dark" | "light";
  className?: string;
}) {
  if (mode === "none" || !icon) return null;
  const hex = colorScheme === "light" ? icon.hexLight : icon.hexDark;
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      style={mode === "color" ? { color: `#${hex}` } : undefined}
      aria-hidden="true"
    >
      <path d={icon.path} fill="currentColor" fillRule={icon.fillRule} />
      {icon.accentPath && (
        <path
          d={icon.accentPath}
          fill="currentColor"
          fillRule={icon.accentFillRule}
          opacity={0.4}
        />
      )}
    </svg>
  );
}

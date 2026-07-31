/**
 * Class-string mapping for {@link IconButton} — pinned by unit tests so a
 * rename of the host contract classes fails CI (RFC 0016).
 *
 * @internal
 */
export type IconButtonSize = "normal" | "sm";

/**
 * Visual tone for {@link IconButton}. `"toolbar"` matches the local-web-viewer
 * bar buttons (toolbar-text icons, hover fill only, no press-scale).
 *
 * @internal
 */
export type IconButtonVariant = "normal" | "toolbar";

/**
 * Resolve the host `.silo-icon-button*` class string for an IconButton's
 * `size` + `variant`. Default is the standalone size; `sm` adds the compact
 * modifier; `toolbar` swaps in the breadcrumb/panel-toolbar tone.
 *
 * @internal
 */
export function iconButtonClass(
  size: IconButtonSize = "normal",
  variant: IconButtonVariant = "normal",
): string {
  const parts = ["silo-icon-button"];
  if (size === "sm") parts.push("silo-icon-button-sm");
  if (variant === "toolbar") parts.push("silo-icon-button-toolbar");
  return parts.join(" ");
}

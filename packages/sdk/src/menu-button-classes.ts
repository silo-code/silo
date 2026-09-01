/**
 * Class-string mapping for {@link MenuButton} — pinned by unit tests so a
 * rename of the host contract classes fails CI (RFC 0016).
 *
 * @internal
 */
export type MenuButtonSize = "normal" | "sm";

/**
 * {@link MenuButton} chrome:
 * - `"bare"` (default) — a borderless label + chevron, for toolbars and list
 *   rows where the trigger sits among other inline controls.
 * - `"field"` — input chrome (border, input background, full width, chevron
 *   pushed to the trailing edge) so it lines up with `Input` / `Select` as a
 *   form field. Reach for it when the menu is a value picker in a form.
 *
 * @internal
 */
export type MenuButtonVariant = "bare" | "field";

/**
 * Resolve the host `.silo-menu-button*` class string for a MenuButton's `size`
 * and `variant`. `sm` and `field` each compose onto the base class, matching
 * how `.silo-button-sm` / `.silo-button-primary` work.
 *
 * @internal
 */
export function menuButtonClass(
  size: MenuButtonSize = "normal",
  variant: MenuButtonVariant = "bare",
): string {
  const classes = ["silo-menu-button"];
  if (size === "sm") classes.push("silo-menu-button-sm");
  if (variant === "field") classes.push("silo-menu-button-field");
  return classes.join(" ");
}

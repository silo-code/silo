/**
 * Class-string mapping for {@link MenuButton} — pinned by unit tests so a
 * rename of the host contract classes fails CI (RFC 0016).
 *
 * @internal
 */
export type MenuButtonSize = "normal" | "sm";

/**
 * Resolve the host `.silo-menu-button*` class string for a MenuButton's `size`.
 * `sm` composes with the base class, matching how `.silo-button-sm` works.
 *
 * @internal
 */
export function menuButtonClass(size: MenuButtonSize = "normal"): string {
  return size === "sm"
    ? "silo-menu-button silo-menu-button-sm"
    : "silo-menu-button";
}

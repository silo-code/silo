/**
 * Class-string mapping for {@link IconButton} — pinned by unit tests so a
 * rename of the host contract classes fails CI (RFC 0016).
 *
 * @internal
 */
export type IconButtonSize = "normal" | "sm";

/**
 * Resolve the host `.silo-icon-button*` class string for an IconButton's
 * `size`. Default is the 32px standalone size; `sm` adds the 26px modifier.
 *
 * @internal
 */
export function iconButtonClass(size: IconButtonSize = "normal"): string {
  return size === "sm"
    ? "silo-icon-button silo-icon-button-sm"
    : "silo-icon-button";
}

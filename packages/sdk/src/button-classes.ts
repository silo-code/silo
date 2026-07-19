/**
 * Class-string mapping for {@link Button} — pinned by unit tests so a rename
 * of the host contract classes fails CI (RFC 0016).
 *
 * @internal
 */
export type ButtonVariant = "normal" | "primary" | "danger";

/**
 * @internal
 */
export type ButtonSize = "normal" | "sm";

/**
 * Resolve the host `.silo-button*` class string for a Button's `variant` +
 * `size`. Primary/danger are standalone class names (not modifiers on
 * `.silo-button`); `sm` composes with any variant.
 *
 * @internal
 */
export function buttonClass(
  variant: ButtonVariant = "normal",
  size: ButtonSize = "normal",
): string {
  const base =
    variant === "primary"
      ? "silo-button-primary"
      : variant === "danger"
        ? "silo-button-danger"
        : "silo-button";
  return size === "sm" ? `${base} silo-button-sm` : base;
}

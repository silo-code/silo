import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  iconButtonClass,
  type IconButtonSize,
  type IconButtonVariant,
} from "./icon-button-classes";

export type { IconButtonSize, IconButtonVariant };

/**
 * A square icon-only button — the kit's one answer for ✕, ⋮, ↻, ✏️, and
 * friends. `aria-label` is **required**: the icon is the only visual, so the
 * label is the accessible name. Pair with {@link Tooltip} so sighted users
 * get the same label on hover.
 *
 * Sized in terms of `--silo-font-size-base` so the hit target and child SVGs
 * scale with Silo's UI zoom (`uiFontSize`). Prefer Phosphor `size="1em"`
 * (or omit a fixed px size) so the glyph tracks the button.
 *
 * Styled purely via host-provided `.silo-icon-button*` classes — no
 * stylesheet import is needed in the extension.
 *
 * @example
 * ```tsx
 * <IconButton aria-label="Refresh" onClick={refresh}>
 *   <RefreshIcon size="1em" />
 * </IconButton>
 *
 * // compact — e.g. in a ListRow's trailing slot
 * <IconButton size="sm" aria-label="Pin" onClick={pin}>
 *   <PinIcon size="1em" />
 * </IconButton>
 *
 * // panel / breadcrumb toolbar (local-web-viewer tone)
 * <IconButton size="sm" variant="toolbar" aria-label="Mark">
 *   <FlagIcon size="1em" weight="bold" />
 * </IconButton>
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function IconButton({
  size = "normal",
  variant = "normal",
  className,
  type = "button",
  children,
  "aria-label": ariaLabel,
  ...rest
}: {
  /**
   * Hit-target size in `em` of `--silo-font-size-base` (tracks Zoom In/Out).
   * `normal` = 2.5em, `sm` = 2em (local-web-viewer toolbar buttons).
   */
  size?: IconButtonSize;
  /**
   * `"toolbar"` — black/white toolbar-text icons, hover fill only, no
   * press-scale. Use on editor/terminal breadcrumb clusters and panel bars.
   */
  variant?: IconButtonVariant;
  /** Required — the icon is the only visual. */
  "aria-label": string;
  children?: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label">) {
  const classes = iconButtonClass(size, variant);
  return (
    <button
      type={type}
      aria-label={ariaLabel}
      className={className ? `${classes} ${className}` : classes}
      {...rest}
    >
      {children}
    </button>
  );
}

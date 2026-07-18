import type { ButtonHTMLAttributes, ReactNode } from "react";
import { iconButtonClass, type IconButtonSize } from "./icon-button-classes";

export type { IconButtonSize };

/**
 * A square icon-only button — the kit's one answer for ✕, ⋮, ↻, ✏️, and
 * friends. `aria-label` is **required**: the icon is the only visual, so the
 * label is the accessible name. Pair with {@link Tooltip} so sighted users
 * get the same label on hover.
 *
 * Styled purely via host-provided `.silo-icon-button*` classes — no
 * stylesheet import is needed in the extension.
 *
 * @example
 * ```tsx
 * <IconButton aria-label="Refresh" onClick={refresh}>
 *   <RefreshIcon />
 * </IconButton>
 *
 * // compact — e.g. in a ListRow's trailing slot
 * <IconButton size="sm" aria-label="Pin" onClick={pin}>
 *   <PinIcon />
 * </IconButton>
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function IconButton({
  size = "normal",
  className,
  type = "button",
  children,
  "aria-label": ariaLabel,
  ...rest
}: {
  /** 32px standalone / 26px for tight or inline contexts. */
  size?: IconButtonSize;
  /** Required — the icon is the only visual. */
  "aria-label": string;
  children?: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label">) {
  const classes = iconButtonClass(size);
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

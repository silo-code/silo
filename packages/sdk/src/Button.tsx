import type { ButtonHTMLAttributes, ReactNode } from "react";
import {
  buttonClass,
  type ButtonSize,
  type ButtonVariant,
} from "./button-classes";

export type { ButtonSize, ButtonVariant };

/**
 * The action button in three variants. In a modal footer the primary action
 * sits rightmost with neutral actions to its left (see {@link ModalActions}).
 *
 * Styled purely via host-provided `.silo-button*` classes — no stylesheet
 * import is needed in the extension.
 *
 * @example
 * ```tsx
 * <Button onClick={cancel}>Cancel</Button>
 * <Button variant="primary" onClick={save}>Save</Button>
 * <Button variant="danger" onClick={remove}>Delete</Button>
 * <Button size="sm">Compact</Button>
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function Button({
  variant = "normal",
  size = "normal",
  className,
  type = "button",
  children,
  ...rest
}: {
  /** `primary` = the accent-filled main action; `danger` = destructive. */
  variant?: ButtonVariant;
  /** `sm` for inline/compact contexts (e.g. a footer `start` slot). */
  size?: ButtonSize;
  children?: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  const classes = buttonClass(variant, size);
  return (
    <button
      type={type}
      className={className ? `${classes} ${className}` : classes}
      {...rest}
    >
      {children}
    </button>
  );
}

import { forwardRef, type InputHTMLAttributes } from "react";
import { inputClass } from "./input-classes";

/**
 * The single text-input treatment used across modal content: input-bg,
 * 6×8px padding, small radius, the shared focus ring.
 *
 * Styled purely via host-provided `.silo-input*` classes — no stylesheet
 * import is needed in the extension.
 *
 * @example
 * ```tsx
 * <Input
 *   value={name}
 *   onChange={(e) => setName(e.target.value)}
 *   placeholder="Workspace name"
 * />
 * <Input block />
 * ```
 *
 * @category Consumer Services
 * @public
 */
export const Input = forwardRef<
  HTMLInputElement,
  {
    /** Stretch to the container width. */
    block?: boolean;
  } & InputHTMLAttributes<HTMLInputElement>
>(function Input({ block = false, className, ...rest }, ref) {
  const classes = inputClass(block);
  return (
    <input
      ref={ref}
      className={className ? `${classes} ${className}` : classes}
      {...rest}
    />
  );
});

import { forwardRef, type TextareaHTMLAttributes } from "react";

/**
 * Multi-line text entry wearing the same tokens as {@link Input}, plus
 * comfortable line-height, vertical resize, and a 64px minimum height.
 *
 * Styled purely via the host-provided `.silo-textarea` class — no
 * stylesheet import is needed in the extension.
 *
 * @example
 * ```tsx
 * <Textarea
 *   value={notes}
 *   onChange={(e) => setNotes(e.target.value)}
 *   placeholder="Notes…"
 * />
 * ```
 *
 * @category Consumer Services
 * @public
 */
export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      className={className ? `silo-textarea ${className}` : "silo-textarea"}
      {...rest}
    />
  );
});

import type { SelectHTMLAttributes, ReactNode } from "react";

/**
 * A native `<select>` wearing the {@link Input} treatment — keep it for short
 * enumerable values ("Block / Bar / Underline").
 *
 * Styled purely via the host-provided `.silo-select` class — no stylesheet
 * import is needed in the extension.
 *
 * @example
 * ```tsx
 * <Select value={cursorStyle} onChange={(e) => setCursorStyle(e.target.value)}>
 *   <option value="block">Block</option>
 *   <option value="bar">Bar</option>
 * </Select>
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function Select({
  className,
  children,
  ...rest
}: {
  children?: ReactNode;
} & Omit<SelectHTMLAttributes<HTMLSelectElement>, "children">) {
  return (
    <select
      className={className ? `silo-select ${className}` : "silo-select"}
      {...rest}
    >
      {children}
    </select>
  );
}

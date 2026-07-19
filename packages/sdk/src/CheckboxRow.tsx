import type { InputHTMLAttributes } from "react";

/**
 * A labeled checkbox row (15px box, accent check). The whole label is the
 * click target.
 *
 * Styled purely via the host-provided `.silo-checkbox-row` class — no
 * stylesheet import is needed in the extension.
 *
 * @example
 * ```tsx
 * <CheckboxRow
 *   label="Only monitor the checked-out branch"
 *   checked={onlyCheckedOut}
 *   onChange={setOnlyCheckedOut}
 * />
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function CheckboxRow({
  label,
  checked,
  onChange,
  disabled,
  className,
  ...rest
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
} & Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type" | "checked" | "onChange" | "disabled" | "children"
>) {
  return (
    <label
      className={
        className ? `silo-checkbox-row ${className}` : "silo-checkbox-row"
      }
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        {...rest}
      />
      {label}
    </label>
  );
}

import type { ButtonHTMLAttributes } from "react";
import { switchDataChecked } from "./switch-classes";

/**
 * The iOS-style on/off toggle used throughout settings. Off = recessed
 * `bg-active` track with a hairline border; on = accent fill. Focus uses a
 * positive-offset ring (the one deliberate exception to the shared inset
 * ring — an 18px pill can't take an inset outline).
 *
 * Styled purely via the host-provided `.silo-switch-track` class — no
 * stylesheet import is needed in the extension.
 *
 * @example
 * ```tsx
 * <Switch
 *   checked={formatOnSave}
 *   onChange={setFormatOnSave}
 *   aria-label="Format on save"
 * />
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function Switch({
  checked,
  onChange,
  disabled,
  "aria-label": ariaLabel,
  className,
  type = "button",
  ...rest
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /**
   * Required unless wrapped by a labeled {@link SettingRow}.
   */
  "aria-label"?: string;
} & Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onChange" | "aria-label" | "children" | "role" | "aria-checked"
>) {
  return (
    <button
      type={type}
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      data-checked={switchDataChecked(checked)}
      className={
        className ? `silo-switch-track ${className}` : "silo-switch-track"
      }
      onClick={() => {
        if (disabled) return;
        onChange(!checked);
      }}
      {...rest}
    />
  );
}

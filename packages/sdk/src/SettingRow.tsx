import type { ReactNode } from "react";

/**
 * The label + hint + control row every settings surface uses: title and dim
 * description on the left, the control pinned right. Rows in a group are
 * separated by hairline dividers.
 *
 * Styled purely via host-provided `.silo-setting-row*` classes — no
 * stylesheet import is needed in the extension.
 *
 * @example
 * ```tsx
 * <SettingRow
 *   label="Format on save"
 *   hint="Run Format Document before writing to disk."
 * >
 *   <Switch
 *     checked={formatOnSave}
 *     onChange={setFormatOnSave}
 *     aria-label="Format on save"
 *   />
 * </SettingRow>
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function SettingRow({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  /** The control — `Switch`, `Select`, `Input`, etc. */
  children?: ReactNode;
}) {
  return (
    <div className="silo-setting-row">
      <div className="silo-setting-row-text">
        <div className="silo-setting-row-label">{label}</div>
        {hint != null && <div className="silo-setting-row-hint">{hint}</div>}
      </div>
      <div className="silo-setting-row-control">{children}</div>
    </div>
  );
}

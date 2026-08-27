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
  enabled,
  dependent,
  children,
}: {
  label: string;
  hint?: string;
  /**
   * @internal Unstable. For bundled first-party extensions proving the UX;
   * not a documented public API. Third parties must not rely on it until a
   * graduation RFC. Gates {@link dependent} — a plain boolean, unrelated to
   * whatever control `children` renders (a `Switch`, a `Select`, or nothing
   * at all). Omit (or leave `true`) to leave `dependent` always enabled.
   */
  enabled?: boolean;
  /**
   * @internal Unstable. For bundled first-party extensions proving the UX;
   * not a documented public API. Third parties must not rely on it until a
   * graduation RFC. Extra content rendered under the hint, in the same text
   * column — sub-settings that only make sense while this row's own setting
   * is on. Rendered inside a native `<fieldset>`: when `enabled` is `false`,
   * every focusable descendant is disabled automatically and the whole block
   * dims — no need to thread `disabled` into each child by hand.
   */
  dependent?: ReactNode;
  /** The control — `Switch`, `Select`, `Input`, etc. */
  children?: ReactNode;
}) {
  return (
    <div className="silo-setting-row">
      <div className="silo-setting-row-text">
        <div className="silo-setting-row-label">{label}</div>
        {hint != null && <div className="silo-setting-row-hint">{hint}</div>}
        {dependent != null && (
          <fieldset
            className="silo-setting-row-dependent"
            disabled={enabled === false}
          >
            {dependent}
          </fieldset>
        )}
      </div>
      <div className="silo-setting-row-control">{children}</div>
    </div>
  );
}

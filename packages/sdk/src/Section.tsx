import type { ReactNode } from "react";

/**
 * A labeled group — the uppercase `NAME` / `FOLDERS` / `FORMATTING` headers
 * seen throughout Silo's modals and settings pages.
 *
 * Styled purely via host-provided `.silo-section*` classes — no stylesheet
 * import is needed in the extension.
 *
 * @example
 * ```tsx
 * <Section label="Formatting">
 *   <SettingRow
 *     label="Format on save"
 *     hint="Run Format Document before writing to disk."
 *   >
 *     <Switch
 *       checked={formatOnSave}
 *       onChange={setFormatOnSave}
 *       aria-label="Format on save"
 *     />
 *   </SettingRow>
 * </Section>
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function Section({
  label,
  accessory,
  children,
}: {
  /** Rendered uppercase, semibold, letter-spaced, chrome−1, `text-lo`. */
  label: string;
  /** Right-aligned — a count badge, an add affordance. */
  accessory?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="silo-section">
      <div className="silo-section-header">
        <span className="silo-section-label">{label}</span>
        {accessory}
      </div>
      {children}
    </div>
  );
}

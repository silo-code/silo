import { createContext, useContext, type ReactNode } from "react";
import { radioCardDataSelected } from "./radio-card-classes";

const RadioGroupContext = createContext<{
  value: string;
  onChange: (value: string) => void;
} | null>(null);

/**
 * Stacked option cards — each a full-width click target with a radio dot, a
 * bold title, and a dim description. Wrap {@link RadioCard} children; the
 * selected card gets an accent border and a faint accent tint. Native tab
 * stops per card — no arrow-key roving.
 *
 * Styled purely via host-provided `.silo-radio-card*` classes — no
 * stylesheet import is needed in the extension.
 *
 * @example
 * ```tsx
 * <RadioGroup value={mode} onChange={setMode}>
 *   <RadioCard
 *     value="clear"
 *     title="Clear the finished indicator"
 *     description="Viewing the terminal acknowledges the run — the green check disappears."
 *   />
 *   <RadioCard
 *     value="keep"
 *     title="Keep it until the next run"
 *     description="Viewing changes nothing."
 *   />
 * </RadioGroup>
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function RadioGroup({
  value,
  onChange,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  children?: ReactNode;
}) {
  return (
    <RadioGroupContext.Provider value={{ value, onChange }}>
      {children}
    </RadioGroupContext.Provider>
  );
}

/**
 * One option inside a {@link RadioGroup}. The whole card is the click target.
 *
 * @example
 * ```tsx
 * <RadioCard
 *   value="clear"
 *   title="Clear the finished indicator"
 *   description="Viewing the terminal acknowledges the run."
 * />
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function RadioCard({
  value,
  title,
  description,
}: {
  value: string;
  title: string;
  description?: string;
}) {
  const group = useContext(RadioGroupContext);
  if (!group) {
    throw new Error("RadioCard must be used inside a RadioGroup");
  }
  const selected = group.value === value;
  const dataSelected = radioCardDataSelected(selected);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      className="silo-radio-card"
      {...(dataSelected != null ? { "data-selected": dataSelected } : {})}
      onClick={() => group.onChange(value)}
    >
      <span className="silo-radio-card-dot" aria-hidden="true" />
      <span>
        <span className="silo-radio-card-title">{title}</span>
        {description != null && (
          <span className="silo-radio-card-desc">{description}</span>
        )}
      </span>
    </button>
  );
}

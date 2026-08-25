import type { ReactNode } from "react";
import { searchInputClass } from "./search-input-classes";

function SearchIcon() {
  return (
    <svg
      className="silo-search-input-icon"
      width="13"
      height="13"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="5.2" stroke="currentColor" strokeWidth="1.4" />
      <path
        d="M11 11l3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" aria-hidden="true">
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The filter-as-you-type field: leading search icon, and a clear ✕ that
 * appears once there's a value (and stays a real tab stop). Pair with
 * {@link List} for the standard picker pattern.
 *
 * Styled purely via host-provided `.silo-search-input*` classes — no
 * stylesheet import is needed in the extension.
 *
 * @example
 * ```tsx
 * <SearchInput
 *   value={query}
 *   onValueChange={setQuery}
 *   placeholder="Filter branches…"
 * />
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function SearchInput({
  value,
  onValueChange,
  placeholder,
  autoFocus,
  onClear,
}: {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  /** Extra hook when ✕ clears the field. */
  onClear?: () => void;
}): ReactNode {
  const hasValue = value.length > 0;
  return (
    <div className={searchInputClass(hasValue)}>
      <SearchIcon />
      <input
        type="text"
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onValueChange(e.target.value)}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
      />
      <button
        type="button"
        className="silo-search-input-clear"
        aria-label="Clear"
        tabIndex={hasValue ? 0 : -1}
        onClick={() => {
          onValueChange("");
          onClear?.();
        }}
      >
        <ClearIcon />
      </button>
    </div>
  );
}

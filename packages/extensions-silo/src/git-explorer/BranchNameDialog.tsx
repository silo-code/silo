import { useLayoutEffect, useRef, useState } from "react";

export interface BranchNameDialogProps {
  /** Optional label above the input. */
  label?: string;
  /** Pre-fills the input (selected on open) — used by rename. */
  initialValue?: string;
  /** Placeholder shown when empty. */
  placeholder?: string;
  /** Confirm button label, e.g. "Create" / "Rename". */
  confirmLabel: string;
  /** Resolve the host modal with the entered name, or `undefined` to cancel. */
  close: (name?: string) => void;
}

/**
 * A single-line branch-name input rendered as `ctx.ui.showModal` content, used
 * for both create and rename. Unlike `ctx.ui.prompt`, its input opts out of
 * autocapitalize / autocorrect / spellcheck — branch names are literal text.
 * The host owns the surrounding modal chrome and title.
 */
export function BranchNameDialog({
  label,
  initialValue,
  placeholder,
  confirmLabel,
  close,
}: BranchNameDialogProps) {
  const [name, setName] = useState(initialValue ?? "");
  const ref = useRef<HTMLInputElement | null>(null);

  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);

  const trimmed = name.trim();
  return (
    <form
      className="silo-modal-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (trimmed) close(trimmed);
      }}
    >
      {label && <label className="silo-modal-label">{label}</label>}
      <input
        ref={ref}
        className="silo-modal-input"
        value={name}
        placeholder={placeholder}
        onChange={(e) => setName(e.target.value)}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
      />
      <div className="silo-modal-actions">
        <button type="button" className="silo-button" onClick={() => close()}>
          Cancel
        </button>
        <button
          type="submit"
          className="silo-button-primary"
          disabled={!trimmed}
        >
          {confirmLabel}
        </button>
      </div>
    </form>
  );
}

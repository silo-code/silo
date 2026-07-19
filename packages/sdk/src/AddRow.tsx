import type { ButtonHTMLAttributes, ReactNode } from "react";

function PlusIcon() {
  return (
    <svg
      className="silo-add-row-plus"
      width="12"
      height="12"
      viewBox="0 0 16 16"
      aria-hidden="true"
    >
      <path
        d="M8 2v12M2 8h12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * The ghost "＋ Add…" action that sits flush under a {@link List} — visually
 * a row, semantically a button. No fill at rest; `bg-hover` on hover.
 *
 * Styled purely via host-provided `.silo-add-row*` classes — no stylesheet
 * import is needed in the extension.
 *
 * @example
 * ```tsx
 * <List aria-label="Folders">…</List>
 * <AddRow onClick={addFolder}>Add Folder…</AddRow>
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function AddRow({
  children,
  className,
  type = "button",
  ...rest
}: {
  children?: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children">) {
  return (
    <button
      type={type}
      className={className ? `silo-add-row ${className}` : "silo-add-row"}
      {...rest}
    >
      <PlusIcon />
      {children}
    </button>
  );
}

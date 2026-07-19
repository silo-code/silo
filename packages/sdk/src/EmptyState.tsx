import type { ReactNode } from "react";
import {
  emptyStateIconDataTone,
  type EmptyStateTone,
} from "./empty-state-classes";

export type { EmptyStateTone };

/**
 * The big-icon + title + dim-description block a modal shows when a list is
 * empty or everything is fine ("All workflows passing"). Renders flat in the
 * modal body — no card, no shadow of its own.
 *
 * Styled purely via host-provided `.silo-empty-state*` classes — no
 * stylesheet import is needed in the extension.
 *
 * @example
 * ```tsx
 * <EmptyState
 *   tone="ok"
 *   icon={<CheckIcon />}
 *   title="All workflows passing"
 *   description="No failures or active runs on this repo."
 * />
 *
 * <EmptyState
 *   icon={<SearchIcon />}
 *   title="No matching branches"
 *   description="Try a different filter."
 * />
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function EmptyState({
  tone = "neutral",
  icon,
  title,
  description,
  action,
}: {
  /** Colors the circled icon; `ok` = green ring for positive-empty. */
  tone?: EmptyStateTone;
  icon?: ReactNode;
  title: string;
  description?: string;
  /** e.g. a `Button` ("Clear filter"). */
  action?: ReactNode;
}) {
  const dataTone = emptyStateIconDataTone(tone);
  return (
    <div className="silo-empty-state">
      {icon != null && (
        <div
          className="silo-empty-state-icon"
          {...(dataTone != null ? { "data-tone": dataTone } : {})}
        >
          {icon}
        </div>
      )}
      <div className="silo-empty-state-title">{title}</div>
      {description != null && (
        <div className="silo-empty-state-desc">{description}</div>
      )}
      {action}
    </div>
  );
}

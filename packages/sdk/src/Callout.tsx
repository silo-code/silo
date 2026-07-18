import type { ReactNode } from "react";

/**
 * A quiet set-off box for explanatory copy — a hairline border around body
 * text, no fill, no tone. Not a warning/error/info alert (there is
 * deliberately no `tone`): status belongs to {@link Badge} tones and
 * {@link EmptyState}.
 *
 * Styled purely via the host-provided `.silo-callout` class — no stylesheet
 * import is needed in the extension.
 *
 * @example
 * ```tsx
 * <Callout>
 *   Opening a worktree adds it as another folder in this workspace — its
 *   files, terminals, and Git panel appear alongside your current ones.
 *   Closing a view leaves the worktree untouched on disk.
 * </Callout>
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function Callout({ children }: { children?: ReactNode }) {
  return <div className="silo-callout">{children}</div>;
}

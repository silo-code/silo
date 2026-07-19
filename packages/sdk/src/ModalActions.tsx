import type { ReactNode } from "react";

/**
 * The right-aligned footer row for a modal's action buttons — a thin
 * `.silo-modal-actions` wrapper so every modal's footer lines up without each
 * caller re-specifying the flex row. Optional `start` slot pins meta text or
 * a secondary action on the left.
 *
 * Styled purely via host-provided `.silo-modal-actions*` classes — no
 * stylesheet import is needed in the extension.
 *
 * @example
 * ```tsx
 * <ModalActions>
 *   <Button onClick={close}>Cancel</Button>
 *   <Button variant="primary" onClick={save}>Create</Button>
 * </ModalActions>
 *
 * <ModalActions start="6 sessions · 6 procs">
 *   <Button>Go to Terminal</Button>
 *   <Button variant="danger">End Task</Button>
 * </ModalActions>
 *
 * <ModalActions
 *   start={<Button size="sm" onClick={create}>+ Create branch</Button>}
 * >
 *   <Button onClick={fetch}>Fetch</Button>
 * </ModalActions>
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function ModalActions({
  start,
  children,
}: {
  /**
   * Optional left-pinned slot for meta text or a secondary action.
   */
  start?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="silo-modal-actions">
      {start != null && start !== false && (
        <div className="silo-modal-actions-start">{start}</div>
      )}
      {children}
    </div>
  );
}

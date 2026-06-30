/**
 * Pure decision logic for drag-and-drop reordering in the Workspaces panel.
 *
 * The panel has two independent HTML5 drag surfaces: workspace rows (reordered
 * within the ungrouped list or within a group) and group headers (reordered
 * among themselves). This module owns the *decisions* — where a pointer drops
 * and what mutation a drop implies — with no React or DOM dependency, so they
 * are unit-testable in isolation. The React state and event wiring live in
 * {@link useWorkspaceDnd}; the store mutations live in the host.
 */

export type DropPosition = "before" | "after";

/** A hovered drop location: an element id plus which edge the pointer favors. */
export interface DropTarget {
  id: string;
  position: DropPosition;
}

/**
 * `dataTransfer` keys used by the workspace panel's drag surfaces. Kept here so
 * the producer (drag start) and consumer (drop) can never drift apart.
 */
export const WS_DND_MIME = {
  /** The dragged workspace's id. */
  workspaceId: "text/x-workspace-id",
  /** The group a dragged workspace came from, or "" when it was ungrouped. */
  sourceGroup: "text/x-source-group",
  /** The dragged group's id (group-header drags). */
  groupId: "text/x-group-id",
} as const;

/**
 * The mutation a resolved workspace drop implies. A discriminated union so new
 * drag affordances (e.g. moving a workspace into or out of a group) can be added
 * as new variants without disturbing existing call sites.
 */
export type WorkspaceDropIntent =
  | { kind: "reorder-global"; fromId: string; toId: string; position: DropPosition }
  | {
      kind: "reorder-in-group";
      groupId: string;
      fromId: string;
      toId: string;
      position: DropPosition;
    };

/** The mutation a resolved group-header drop implies. */
export interface GroupDropIntent {
  kind: "reorder-groups";
  fromId: string;
  toId: string;
  position: DropPosition;
}

/**
 * Which half of the target rectangle the pointer is in — the top half means
 * "drop before", the bottom half "drop after".
 */
export function computeDropPosition(
  clientY: number,
  rect: { top: number; height: number },
): DropPosition {
  return clientY < rect.top + rect.height / 2 ? "before" : "after";
}

/**
 * The drop-indicator target for a dragover over `targetId`, or `null` when there
 * is no active drag or the pointer is over the dragged item itself (no indicator
 * should show on the element being dragged).
 */
export function dropTargetForDragOver(args: {
  draggingId: string | null;
  targetId: string;
  position: DropPosition;
}): DropTarget | null {
  const { draggingId, targetId, position } = args;
  if (!draggingId || draggingId === targetId) return null;
  return { id: targetId, position };
}

/** True when both describe the same drop target — a cheap state-update guard. */
export function sameDropTarget(
  a: DropTarget | null,
  b: DropTarget | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.id === b.id && a.position === b.position;
}

/**
 * Resolve a completed workspace drag into the mutation it implies, or `null` for
 * a no-op (no active drag, no hovered target, or a drop onto the dragged item).
 * A drop within the *same* group reorders inside that group; anything else
 * reorders the global (ungrouped) order.
 */
export function resolveWorkspaceDrop(args: {
  draggingId: string | null;
  dropTarget: DropTarget | null;
  targetId: string;
  sourceGroupId: string; // "" when dragged from the ungrouped list
  targetGroupId?: string; // undefined when the target row is ungrouped
}): WorkspaceDropIntent | null {
  const { draggingId, dropTarget, targetId, sourceGroupId, targetGroupId } =
    args;
  if (!draggingId || !dropTarget || draggingId === targetId) return null;
  if (targetGroupId && sourceGroupId === targetGroupId) {
    return {
      kind: "reorder-in-group",
      groupId: targetGroupId,
      fromId: draggingId,
      toId: dropTarget.id,
      position: dropTarget.position,
    };
  }
  return {
    kind: "reorder-global",
    fromId: draggingId,
    toId: dropTarget.id,
    position: dropTarget.position,
  };
}

/**
 * Resolve a completed group-header drag into a reorder intent, or `null` for a
 * no-op.
 */
export function resolveGroupDrop(args: {
  draggingGroupId: string | null;
  groupDropTarget: DropTarget | null;
  targetGroupId: string;
}): GroupDropIntent | null {
  const { draggingGroupId, groupDropTarget, targetGroupId } = args;
  if (!draggingGroupId || !groupDropTarget || draggingGroupId === targetGroupId)
    return null;
  return {
    kind: "reorder-groups",
    fromId: draggingGroupId,
    toId: groupDropTarget.id,
    position: groupDropTarget.position,
  };
}

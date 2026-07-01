/**
 * Pure decision logic for drag-and-drop in the Workspaces panel.
 *
 * The panel is one interleaved top-level list of **entries** — ungrouped
 * workspace rows and group cards — plus workspace rows *inside* each group.
 * A drag can be a group (reordered among the top level) or a workspace
 * (reordered, moved into a group, or pulled back out). This module owns the
 * *decisions* — where a pointer drops and what mutation a drop implies — with no
 * React or DOM dependency, so they are unit-testable in isolation. React state
 * and event wiring live in {@link useWorkspaceDnd}; the store mutations in the host.
 */

export type DropPosition = "before" | "after";

/** A hovered drop location: an element id plus which edge the pointer favors. */
export interface DropTarget {
  id: string;
  position: DropPosition;
}

/** `dataTransfer` keys used by the panel's drag surfaces. */
export const WS_DND_MIME = {
  workspaceId: "text/x-workspace-id",
  groupId: "text/x-group-id",
} as const;

/**
 * The mutation a resolved drop implies:
 * - `reorder-panel` — reorder a top-level entry (ungrouped workspace *or* group)
 *   within the single interleaved panel order.
 * - `reorder-in-group` — reorder a workspace within its current group.
 * - `move-to-group` — add a workspace to `groupId` (at an anchor, or appended).
 * - `ungroup` — pull a workspace out to the top level (at an anchor, or appended).
 */
export type PanelDropIntent =
  | {
      kind: "reorder-panel";
      fromId: string;
      toId: string;
      position: DropPosition;
    }
  | {
      kind: "reorder-in-group";
      groupId: string;
      fromId: string;
      toId: string;
      position: DropPosition;
    }
  | {
      kind: "move-to-group";
      groupId: string;
      fromId: string;
      toId?: string;
      position?: DropPosition;
    }
  | { kind: "ungroup"; fromId: string; toId?: string; position?: DropPosition };

/** Which half of the target rectangle the pointer is in. */
export function computeDropPosition(
  clientY: number,
  rect: { top: number; height: number },
): DropPosition {
  return clientY < rect.top + rect.height / 2 ? "before" : "after";
}

/**
 * Three-zone hit-test for a **group card** during a workspace drag: the top/
 * bottom `edgeFraction` of the card mean "drop before/after this group at the
 * top level" (an insertion line), and the middle means "drop into the group"
 * (the ring). This is what makes dragging a workspace *out* of a group show a
 * clear target next to any group, not just an ambiguous whole-card "into".
 */
export function computeCardZone(
  clientY: number,
  rect: { top: number; height: number },
  edgeFraction = 0.28,
): "before" | "into" | "after" {
  const edge = rect.height * edgeFraction;
  if (clientY < rect.top + edge) return "before";
  if (clientY > rect.top + rect.height - edge) return "after";
  return "into";
}

/**
 * The drop-indicator target for a dragover over `targetId`, or `null` when the
 * dragged thing is the target itself (no indicator on the element being dragged).
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
 * A dragged thing, described by the hook's state: a group, or a workspace (with
 * the group it came from — `""` when it was ungrouped). Exactly one id is set.
 */
export interface DraggedEntity {
  draggingGroupId: string | null;
  draggingWorkspaceId: string | null;
  draggingSourceGroup: string;
}

/**
 * The single top-level drop rule, shared by every top-level surface (rows,
 * group-card edges, and the background catch-all) so they can't diverge: drop
 * the dragged entity at `anchor`. A group or ungrouped workspace reorders the
 * panel there; a grouped workspace is pulled out to there. Dropping an entity
 * relative to itself is a no-op.
 */
export function panelDropForEntity(
  dragged: DraggedEntity,
  anchor: DropTarget,
): PanelDropIntent | null {
  const { draggingGroupId, draggingWorkspaceId, draggingSourceGroup } = dragged;
  const to = { toId: anchor.id, position: anchor.position };
  if (draggingGroupId) {
    return draggingGroupId === anchor.id
      ? null
      : { kind: "reorder-panel", fromId: draggingGroupId, ...to };
  }
  if (draggingWorkspaceId) {
    if (draggingWorkspaceId === anchor.id) return null;
    return draggingSourceGroup
      ? { kind: "ungroup", fromId: draggingWorkspaceId, ...to }
      : { kind: "reorder-panel", fromId: draggingWorkspaceId, ...to };
  }
  return null;
}

/**
 * Resolve a drop onto a **top-level entry** (an ungrouped workspace row). Any
 * drag can land here — see {@link panelDropForEntity}.
 */
export function resolveTopLevelDrop(args: {
  draggingGroupId: string | null;
  draggingWorkspaceId: string | null;
  draggingSourceGroup: string; // "" when the dragged workspace is ungrouped
  dropTarget: DropTarget | null;
}): PanelDropIntent | null {
  const { dropTarget, ...dragged } = args;
  return dropTarget ? panelDropForEntity(dragged, dropTarget) : null;
}

/**
 * Resolve a drop onto a **group card**. On an edge (top/bottom) the dragged
 * entity lands adjacent to the card at the top level; over the middle a
 * workspace is moved *into* the group — unless it already belongs to that group,
 * which is a no-op (so dropping on your own group's body doesn't shuffle you to
 * the bottom). A group can never be nested into another group.
 */
export function resolveGroupCardDrop(args: {
  draggingGroupId: string | null;
  draggingWorkspaceId: string | null;
  draggingSourceGroup: string;
  // Set (with `id === targetGroupId`) when the pointer is on the card's top/
  // bottom edge; `null` when over the middle ("into"). The hook keeps exactly
  // one of `dropTarget` / the ring set, so its presence disambiguates the zone.
  dropTarget: DropTarget | null;
  targetGroupId: string;
}): PanelDropIntent | null {
  const {
    draggingGroupId,
    draggingWorkspaceId,
    draggingSourceGroup,
    dropTarget,
    targetGroupId,
  } = args;
  const dragged = { draggingGroupId, draggingWorkspaceId, draggingSourceGroup };
  // A group only ever reorders before/after this card (never nests).
  if (draggingGroupId)
    return dropTarget ? panelDropForEntity(dragged, dropTarget) : null;
  if (draggingWorkspaceId) {
    // Edge → drop adjacent to the group at the top level.
    if (dropTarget && dropTarget.id === targetGroupId)
      return panelDropForEntity(dragged, dropTarget);
    // Middle → into the group, unless it is already a member (no-op).
    if (draggingSourceGroup === targetGroupId) return null;
    return {
      kind: "move-to-group",
      groupId: targetGroupId,
      fromId: draggingWorkspaceId,
    };
  }
  return null;
}

/**
 * Resolve a workspace drop onto a **row inside a group**. Same group → reorder
 * within it; a workspace from elsewhere → move into this group at that anchor.
 * (Group drags are not handled here — they bubble to the enclosing card.)
 */
export function resolveGroupedRowDrop(args: {
  draggingWorkspaceId: string | null;
  draggingSourceGroup: string;
  dropTarget: DropTarget | null;
  targetId: string;
  targetGroupId: string;
}): PanelDropIntent | null {
  const {
    draggingWorkspaceId,
    draggingSourceGroup,
    dropTarget,
    targetId,
    targetGroupId,
  } = args;
  if (!draggingWorkspaceId || !dropTarget || draggingWorkspaceId === targetId)
    return null;
  const anchor = { toId: dropTarget.id, position: dropTarget.position };
  if (draggingSourceGroup === targetGroupId) {
    return {
      kind: "reorder-in-group",
      groupId: targetGroupId,
      fromId: draggingWorkspaceId,
      ...anchor,
    };
  }
  return {
    kind: "move-to-group",
    groupId: targetGroupId,
    fromId: draggingWorkspaceId,
    ...anchor,
  };
}

/**
 * Resolve a drop onto the **list background** — the catch-all zone above the
 * first entry and below the last. `dropTarget` is the anchor the dragover chose
 * (before the first entry, or after the last), so this serves both ends: a group
 * or ungrouped workspace reorders there, and a grouped workspace is pulled out
 * there. Dropping the entity relative to *itself* is a no-op. With no anchor
 * (empty list), a grouped workspace is still pulled out; everything else no-ops.
 */
export function resolveBackgroundDrop(args: {
  draggingGroupId: string | null;
  draggingWorkspaceId: string | null;
  draggingSourceGroup: string;
  dropTarget: DropTarget | null;
}): PanelDropIntent | null {
  const { dropTarget, ...dragged } = args;
  if (!dropTarget) {
    // Empty list (no anchor): a grouped workspace can still be pulled out.
    return dragged.draggingWorkspaceId && dragged.draggingSourceGroup
      ? { kind: "ungroup", fromId: dragged.draggingWorkspaceId }
      : null;
  }
  return panelDropForEntity(dragged, dropTarget);
}

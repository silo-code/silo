import type React from "react";
import { useState } from "react";
import {
  reorderGroups,
  reorderWorkspaceInGroup,
} from "@silo-code/extension-host/internal";
import type { WorkspaceService } from "@silo-code/sdk";
import {
  computeDropPosition,
  dropTargetForDragOver,
  resolveGroupDrop,
  resolveWorkspaceDrop,
  sameDropTarget,
  WS_DND_MIME,
  type DropPosition,
  type DropTarget,
} from "./workspace-dnd";

/** Drag props spread onto a workspace row `<li>`. */
export interface WorkspaceItemDragProps {
  draggable: true;
  onDragStart: (e: React.DragEvent<HTMLLIElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLLIElement>) => void;
  onDrop: (e: React.DragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
}

/** Drag props spread onto a group header `<div>`. */
export interface GroupHeaderDragProps {
  draggable: true;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

/** The drag surface the {@link WorkspacesPanel} consumes. */
export interface WorkspaceDnd {
  /** True while `wsId` is the row being dragged (for the dimmed style). */
  isDragging(wsId: string): boolean;
  /** The drop-indicator edge for `wsId`, or `null` when none. */
  dropEdge(wsId: string): DropPosition | null;
  /** Drag props to spread onto a workspace `<li>`. */
  workspaceProps(wsId: string, groupId?: string): WorkspaceItemDragProps;
  /** True while `groupId`'s header is the element being dragged. */
  isGroupDragging(groupId: string): boolean;
  /** The drop-indicator edge for `groupId`'s header, or `null` when none. */
  groupDropEdge(groupId: string): DropPosition | null;
  /** Drag props to spread onto a group header `<div>`. */
  groupProps(groupId: string): GroupHeaderDragProps;
}

/**
 * Owns the panel's drag-and-drop state and event wiring. The *decisions* live in
 * the pure {@link ./workspace-dnd} model (and are unit-tested there); this hook
 * is thin glue that holds React state, reads/writes `dataTransfer`, and
 * dispatches resolved intents to the store mutations.
 */
export function useWorkspaceDnd(service: WorkspaceService): WorkspaceDnd {
  // Workspace-row drag state.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  // Group-header drag state.
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [groupDropTarget, setGroupDropTarget] = useState<DropTarget | null>(
    null,
  );

  // ── Workspace rows ────────────────────────────────────────────────────────

  function onDragStart(
    e: React.DragEvent<HTMLLIElement>,
    id: string,
    groupId?: string,
  ) {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(WS_DND_MIME.workspaceId, id);
    e.dataTransfer.setData(WS_DND_MIME.sourceGroup, groupId ?? "");
  }

  function onDragOver(e: React.DragEvent<HTMLLIElement>, targetId: string) {
    if (!draggingId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const next = dropTargetForDragOver({
      draggingId,
      targetId,
      position: computeDropPosition(e.clientY, rect),
    });
    if (!sameDropTarget(next, dropTarget)) setDropTarget(next);
  }

  function onDrop(
    e: React.DragEvent<HTMLLIElement>,
    targetId: string,
    groupId?: string,
  ) {
    e.preventDefault();
    const intent = resolveWorkspaceDrop({
      draggingId,
      dropTarget,
      targetId,
      sourceGroupId: e.dataTransfer.getData(WS_DND_MIME.sourceGroup),
      targetGroupId: groupId,
    });
    if (intent?.kind === "reorder-in-group") {
      reorderWorkspaceInGroup(
        intent.groupId,
        intent.fromId,
        intent.toId,
        intent.position,
      );
    } else if (intent?.kind === "reorder-global") {
      service.reorder(intent.fromId, intent.toId, intent.position);
    }
    setDraggingId(null);
    setDropTarget(null);
  }

  function onDragEnd() {
    setDraggingId(null);
    setDropTarget(null);
  }

  // ── Group headers ───────────────────────────────────────────────────────

  function onGroupDragStart(
    e: React.DragEvent<HTMLDivElement>,
    groupId: string,
  ) {
    setDraggingGroupId(groupId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(WS_DND_MIME.groupId, groupId);
    // Stop the event from propagating to any workspace drag handlers.
    e.stopPropagation();
  }

  function onGroupDragOver(
    e: React.DragEvent<HTMLDivElement>,
    targetGroupId: string,
  ) {
    if (!draggingGroupId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = e.currentTarget.getBoundingClientRect();
    const next = dropTargetForDragOver({
      draggingId: draggingGroupId,
      targetId: targetGroupId,
      position: computeDropPosition(e.clientY, rect),
    });
    if (!sameDropTarget(next, groupDropTarget)) setGroupDropTarget(next);
  }

  function onGroupDrop(
    e: React.DragEvent<HTMLDivElement>,
    targetGroupId: string,
  ) {
    e.preventDefault();
    const intent = resolveGroupDrop({
      draggingGroupId,
      groupDropTarget,
      targetGroupId,
    });
    if (intent) reorderGroups(intent.fromId, intent.toId, intent.position);
    setDraggingGroupId(null);
    setGroupDropTarget(null);
  }

  function onGroupDragEnd() {
    setDraggingGroupId(null);
    setGroupDropTarget(null);
  }

  return {
    isDragging: (wsId) => draggingId === wsId,
    dropEdge: (wsId) => (dropTarget?.id === wsId ? dropTarget.position : null),
    workspaceProps: (wsId, groupId) => ({
      draggable: true,
      onDragStart: (e) => onDragStart(e, wsId, groupId),
      onDragOver: (e) => onDragOver(e, wsId),
      onDrop: (e) => onDrop(e, wsId, groupId),
      onDragEnd,
    }),
    isGroupDragging: (groupId) => draggingGroupId === groupId,
    groupDropEdge: (groupId) =>
      groupDropTarget?.id === groupId ? groupDropTarget.position : null,
    groupProps: (groupId) => ({
      draggable: true,
      onDragStart: (e) => onGroupDragStart(e, groupId),
      onDragOver: (e) => onGroupDragOver(e, groupId),
      onDrop: (e) => onGroupDrop(e, groupId),
      onDragEnd: onGroupDragEnd,
    }),
  };
}

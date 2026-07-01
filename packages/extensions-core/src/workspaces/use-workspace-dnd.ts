import type React from "react";
import { useState } from "react";
import {
  moveWorkspaceToGroup,
  reorderPanel,
  reorderWorkspaceInGroup,
  ungroupWorkspace,
} from "@silo-code/extension-host/internal";
import {
  computeCardZone,
  computeDropPosition,
  dropTargetForDragOver,
  resolveBackgroundDrop,
  resolveGroupCardDrop,
  resolveGroupedRowDrop,
  resolveTopLevelDrop,
  sameDropTarget,
  WS_DND_MIME,
  type DropPosition,
  type DropTarget,
  type PanelDropIntent,
} from "./workspace-dnd";

/** Drag props spread onto a workspace row `<li>` (source + drop target). */
export interface WorkspaceItemDragProps {
  draggable: true;
  onDragStart: (e: React.DragEvent<HTMLLIElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLLIElement>) => void;
  onDrop: (e: React.DragEvent<HTMLLIElement>) => void;
  onDragEnd: () => void;
}

/** Drag-source props spread onto a group header `<div>` (the reorder handle). */
export interface GroupHandleProps {
  draggable: true;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
}

/** Drop-target props spread onto the whole group card `<li>`. */
export interface GroupCardDropProps {
  onDragOver: (e: React.DragEvent<HTMLLIElement>) => void;
  onDrop: (e: React.DragEvent<HTMLLIElement>) => void;
}

/** Drop props spread onto the panel body (the "drop at the end" background zone). */
export interface UngroupedZoneDropProps {
  onDragOver: (e: React.DragEvent<HTMLElement>) => void;
  onDrop: (e: React.DragEvent<HTMLElement>) => void;
}

/** The drag surface the {@link WorkspacesPanel} consumes. */
export interface WorkspaceDnd {
  /** True while `wsId` is the workspace row being dragged (dimmed style). */
  isDragging(wsId: string): boolean;
  /** True while `groupId`'s card is the element being dragged (dimmed style). */
  isGroupDragging(groupId: string): boolean;
  /** The before/after reorder edge for a top-level entry / row `id`, or `null`. */
  dropEdge(id: string): DropPosition | null;
  /** True while a dragged workspace is hovering `groupId` (drop-into ring). */
  isWorkspaceOverGroup(groupId: string): boolean;
  /** Props for a workspace `<li>` — pass its group id when it lives in a group. */
  workspaceProps(wsId: string, groupId?: string): WorkspaceItemDragProps;
  /** Drag-source props for a group header `<div>`. */
  groupHandleProps(groupId: string): GroupHandleProps;
  /** Drop-target props for the whole group card `<li>`. */
  groupCardProps(groupId: string): GroupCardDropProps;
  /**
   * Drop props for the panel-body background. Pass the first and last rendered
   * top-level entry ids so a drop above the first row lands at the beginning and
   * one below the last row lands at the end.
   */
  ungroupedZoneProps(
    firstEntryId: string | null,
    lastEntryId: string | null,
  ): UngroupedZoneDropProps;
}

/**
 * Owns the panel's drag-and-drop state and event wiring. Decisions live in the
 * pure {@link ./workspace-dnd} model (unit-tested there); this hook holds React
 * state, sets up `dataTransfer`, and dispatches resolved intents to the store.
 *
 * Drop precedence is by DOM specificity via `stopPropagation`: a workspace row
 * wins over its enclosing group card, and a card wins over the list background.
 * A *group* drag over a grouped row deliberately bubbles to the card (a group
 * can't nest inside a group).
 */
export function useWorkspaceDnd(): WorkspaceDnd {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [draggingSourceGroup, setDraggingSourceGroup] = useState<string>("");
  const [draggingGroupId, setDraggingGroupId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const [overGroupId, setOverGroupId] = useState<string | null>(null);

  function applyDrop(intent: PanelDropIntent | null): void {
    if (!intent) return;
    switch (intent.kind) {
      case "reorder-panel":
        reorderPanel(intent.fromId, intent.toId, intent.position);
        break;
      case "reorder-in-group":
        reorderWorkspaceInGroup(intent.groupId, intent.fromId, intent.toId, intent.position);
        break;
      case "move-to-group":
        moveWorkspaceToGroup(
          intent.fromId,
          intent.groupId,
          intent.toId !== undefined && intent.position !== undefined
            ? { toId: intent.toId, position: intent.position }
            : undefined,
        );
        break;
      case "ungroup":
        ungroupWorkspace(
          intent.fromId,
          intent.toId !== undefined && intent.position !== undefined
            ? { toId: intent.toId, position: intent.position }
            : undefined,
        );
        break;
    }
  }

  function clearDrag(): void {
    setDraggingId(null);
    setDraggingSourceGroup("");
    setDraggingGroupId(null);
    setDropTarget(null);
    setOverGroupId(null);
  }

  // ── Workspace rows (source + drop target) ─────────────────────────────────

  function onWsDragStart(
    e: React.DragEvent<HTMLLIElement>,
    wsId: string,
    groupId?: string,
  ) {
    setDraggingId(wsId);
    setDraggingSourceGroup(groupId ?? "");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(WS_DND_MIME.workspaceId, wsId);
  }

  function onWsDragOver(
    e: React.DragEvent<HTMLLIElement>,
    wsId: string,
    groupId?: string,
  ) {
    const topLevel = groupId === undefined;
    // A top-level row accepts group drags too; a grouped row only workspace
    // drags (group drags bubble up to the card).
    const active = topLevel ? draggingId || draggingGroupId : draggingId;
    if (!active) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    if (overGroupId) setOverGroupId(null);
    const rect = e.currentTarget.getBoundingClientRect();
    const next = dropTargetForDragOver({
      draggingId: draggingGroupId ?? draggingId,
      targetId: wsId,
      position: computeDropPosition(e.clientY, rect),
    });
    if (!sameDropTarget(next, dropTarget)) setDropTarget(next);
  }

  function onWsDrop(
    e: React.DragEvent<HTMLLIElement>,
    wsId: string,
    groupId?: string,
  ) {
    const topLevel = groupId === undefined;
    const active = topLevel ? draggingId || draggingGroupId : draggingId;
    if (!active) return;
    e.preventDefault();
    e.stopPropagation();
    applyDrop(
      topLevel
        ? resolveTopLevelDrop({
            draggingGroupId,
            draggingWorkspaceId: draggingId,
            draggingSourceGroup,
            dropTarget,
          })
        : resolveGroupedRowDrop({
            draggingWorkspaceId: draggingId,
            draggingSourceGroup,
            dropTarget,
            targetId: wsId,
            targetGroupId: groupId,
          }),
    );
    clearDrag();
  }

  // ── Group header (drag source) ────────────────────────────────────────────

  function onGroupDragStart(
    e: React.DragEvent<HTMLDivElement>,
    groupId: string,
  ) {
    setDraggingGroupId(groupId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData(WS_DND_MIME.groupId, groupId);
  }

  // ── Group card (drop target: reorder panel + workspace drop-into) ─────────

  function onGroupCardDragOver(
    e: React.DragEvent<HTMLLIElement>,
    groupId: string,
  ) {
    if (draggingGroupId) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      if (overGroupId) setOverGroupId(null);
      const rect = e.currentTarget.getBoundingClientRect();
      const next = dropTargetForDragOver({
        draggingId: draggingGroupId,
        targetId: groupId,
        position: computeDropPosition(e.clientY, rect),
      });
      if (!sameDropTarget(next, dropTarget)) setDropTarget(next);
      return;
    }
    if (draggingId) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";
      const rect = e.currentTarget.getBoundingClientRect();
      const zone = computeCardZone(e.clientY, rect);
      if (zone === "into") {
        // Middle of the card → drop the workspace into this group (the ring).
        if (dropTarget) setDropTarget(null);
        if (overGroupId !== groupId) setOverGroupId(groupId);
      } else {
        // Top/bottom edge → drop it adjacent to the group at the top level (a
        // line above/below the card).
        if (overGroupId) setOverGroupId(null);
        const next = { id: groupId, position: zone };
        if (!sameDropTarget(next, dropTarget)) setDropTarget(next);
      }
    }
  }

  function onGroupCardDrop(
    e: React.DragEvent<HTMLLIElement>,
    groupId: string,
  ) {
    if (!draggingGroupId && !draggingId) return;
    e.preventDefault();
    e.stopPropagation();
    applyDrop(
      resolveGroupCardDrop({
        draggingGroupId,
        draggingWorkspaceId: draggingId,
        draggingSourceGroup,
        dropTarget,
        targetGroupId: groupId,
      }),
    );
    clearDrag();
  }

  // ── List background = catch-all "drop at an end" zone ─────────────────────
  // The empty area above the first entry and below the last keeps a line at the
  // nearer end and drops there. Above the first rendered entry → the beginning;
  // otherwise → the end.

  function onBgDragOver(
    e: React.DragEvent<HTMLElement>,
    firstEntryId: string | null,
    lastEntryId: string | null,
  ) {
    if (!draggingId && !draggingGroupId) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (overGroupId) setOverGroupId(null);
    // A grouped workspace is never itself a top-level entry, so it can always
    // land at either end; a group / ungrouped workspace can't land on itself.
    const draggedTopLevel = draggingGroupId ?? (draggingSourceGroup ? null : draggingId);
    const firstEl = e.currentTarget.querySelector(".ws-list")?.firstElementChild;
    const atTop = firstEl ? e.clientY < firstEl.getBoundingClientRect().top : false;
    let next: DropTarget | null = null;
    if (atTop && firstEntryId && firstEntryId !== draggedTopLevel) {
      next = { id: firstEntryId, position: "before" };
    } else if (lastEntryId && lastEntryId !== draggedTopLevel) {
      next = { id: lastEntryId, position: "after" };
    }
    if (!sameDropTarget(next, dropTarget)) setDropTarget(next);
  }

  function onBgDrop(e: React.DragEvent<HTMLElement>) {
    if (!draggingId && !draggingGroupId) return;
    e.preventDefault();
    // Use whatever anchor the dragover settled on (beginning or end).
    applyDrop(
      resolveBackgroundDrop({
        draggingGroupId,
        draggingWorkspaceId: draggingId,
        draggingSourceGroup,
        dropTarget,
      }),
    );
    clearDrag();
  }

  return {
    isDragging: (wsId) => draggingId === wsId,
    isGroupDragging: (groupId) => draggingGroupId === groupId,
    dropEdge: (id) => (dropTarget?.id === id ? dropTarget.position : null),
    isWorkspaceOverGroup: (groupId) => overGroupId === groupId,
    workspaceProps: (wsId, groupId) => ({
      draggable: true,
      onDragStart: (e) => onWsDragStart(e, wsId, groupId),
      onDragOver: (e) => onWsDragOver(e, wsId, groupId),
      onDrop: (e) => onWsDrop(e, wsId, groupId),
      onDragEnd: clearDrag,
    }),
    groupHandleProps: (groupId) => ({
      draggable: true,
      onDragStart: (e) => onGroupDragStart(e, groupId),
      onDragEnd: clearDrag,
    }),
    groupCardProps: (groupId) => ({
      onDragOver: (e) => onGroupCardDragOver(e, groupId),
      onDrop: (e) => onGroupCardDrop(e, groupId),
    }),
    ungroupedZoneProps: (firstEntryId, lastEntryId) => ({
      onDragOver: (e) => onBgDragOver(e, firstEntryId, lastEntryId),
      onDrop: onBgDrop,
    }),
  };
}

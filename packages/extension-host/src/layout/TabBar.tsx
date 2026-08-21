import { useMemo, useRef, useState } from "react";
import { sidePanelRegistry } from "../extension-host/side-panels";
import { openMenu } from "../extension-host/menu-controller";
import type { MenuEntry } from "@silo-code/sdk";
import type { SidePanel } from "@silo-code/sdk";
import { store, setSidePanelSlot, reorderSidePanels } from "../state/store";
import { sideTabDrag } from "./drag-state";
import { resolveSidePanelSlot } from "./side-panel-slots";
import {
  topSlot,
  bottomSlot,
  isTopSlot,
  isTopSlotOfColumn,
  getDropInfo,
  createGhost,
  moveGhost,
  removeGhost,
  useSideTabDrag,
  sidePanelVisibilityItems,
} from "./side-column-helpers";

interface TabBarProps {
  panels: SidePanel[];
  slot: string;
  location: "left" | "right";
  activeId: string | null;
  onActivate: (id: string) => void;
}

export function TabBar({
  panels,
  slot,
  location,
  activeId,
  onActivate,
}: TabBarProps) {
  const activeDrag = useSideTabDrag();
  const barRef = useRef<HTMLDivElement>(null);
  const [insertIdx, setInsertIdx] = useState<number | null>(null);
  const pointerRef = useRef<{
    panelId: string;
    panelTitle: string;
    pointerId: number;
    startX: number;
    startY: number;
    isDragging: boolean;
  } | null>(null);

  const isSameSlot = activeDrag?.sourceSlot === slot;

  function getInsertIdx(clientX: number): number {
    if (!barRef.current) return panels.length;
    const tabEls = Array.from(
      barRef.current.querySelectorAll<HTMLElement>(".tab"),
    );
    for (let i = 0; i < tabEls.length; i++) {
      const rect = tabEls[i].getBoundingClientRect();
      if (clientX < rect.left + rect.width / 2) return i;
    }
    return tabEls.length;
  }

  /** Returns true if the target column has no bottom panel (can be split). */
  function canSplitColumn(targetLocation: "left" | "right"): boolean {
    const bSlot = bottomSlot(targetLocation);
    const overrides = store.sidePanelLocations;
    return !sidePanelRegistry
      .list()
      .some((p) => resolveSidePanelSlot(overrides[p.id], p.location) === bSlot);
  }

  function commitDrop(x: number, y: number, draggedPanelId: string) {
    const dropInfo = getDropInfo(x, y);
    if (!dropInfo) {
      sideTabDrag.set(null);
      setInsertIdx(null);
      return;
    }

    const { slot: targetSlot, location: targetLocation, zone } = dropInfo;
    const targetIsTop = isTopSlotOfColumn(targetSlot);

    if (
      targetSlot === slot &&
      zone === "bottom" &&
      targetIsTop &&
      canSplitColumn(targetLocation)
    ) {
      // Dropped on bottom half of own unsplit slot → create vertical split
      setSidePanelSlot(draggedPanelId, bottomSlot(targetLocation));
    } else if (targetSlot === slot) {
      // Same-slot reorder
      const withoutDragged = panels.filter((p) => p.id !== draggedPanelId);
      const idx = Math.min(
        insertIdx ?? withoutDragged.length,
        withoutDragged.length,
      );
      withoutDragged.splice(idx, 0, { id: draggedPanelId } as SidePanel);
      setSidePanelSlot(draggedPanelId, slot);
      reorderSidePanels(withoutDragged.map((p) => p.id));
    } else if (
      zone === "bottom" &&
      targetIsTop &&
      canSplitColumn(targetLocation)
    ) {
      // Bottom half of unsplit column → create vertical split
      setSidePanelSlot(draggedPanelId, bottomSlot(targetLocation));
    } else {
      setSidePanelSlot(draggedPanelId, targetSlot);
    }

    sideTabDrag.set(null);
    setInsertIdx(null);
  }

  function onBarPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0) return;
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>(
      "button.tab",
    );
    if (!button) return;
    const panelId = button.dataset.panelId;
    if (!panelId) return;
    const panel = panels.find((p) => p.id === panelId);
    if (!panel) return;
    // Capture on the bar so we track pointer even through live tab reorders
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault(); // prevent click from firing (we fire activate ourselves)
    pointerRef.current = {
      panelId: panel.id,
      panelTitle: panel.title,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      isDragging: false,
    };
  }

  function onBarPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = pointerRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;

    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;

    if (!drag.isDragging) {
      if (Math.sqrt(dx * dx + dy * dy) < 5) return;
      drag.isDragging = true;
      sideTabDrag.set({ panelId: drag.panelId, sourceSlot: slot });
      createGhost(drag.panelTitle, e.clientX, e.clientY);
    }

    moveGhost(e.clientX, e.clientY);

    const dropInfo = getDropInfo(e.clientX, e.clientY);
    if (dropInfo) {
      const isSameSlotHover = dropInfo.slot === slot;
      setInsertIdx(isSameSlotHover ? getInsertIdx(e.clientX) : null);
      sideTabDrag.set({
        panelId: drag.panelId,
        sourceSlot: slot,
        hoverSlot: dropInfo.slot,
        hoverZone: dropInfo.zone,
      });
    } else {
      setInsertIdx(null);
      sideTabDrag.set({ panelId: drag.panelId, sourceSlot: slot });
    }
  }

  function onBarPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const drag = pointerRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    pointerRef.current = null;

    if (!drag.isDragging) {
      // Treat as a click: activate the panel
      onActivate(drag.panelId);
      return;
    }

    removeGhost();
    commitDrop(e.clientX, e.clientY, drag.panelId);
  }

  function onBarPointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    const drag = pointerRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    pointerRef.current = null;
    if (drag.isDragging) removeGhost();
    sideTabDrag.set(null);
    setInsertIdx(null);
  }

  // During same-slot drags show live-reordered tabs
  const displayPanels = useMemo(() => {
    if (!isSameSlot || insertIdx === null || !activeDrag) return panels;
    const dragged = panels.find((p) => p.id === activeDrag.panelId);
    if (!dragged) return panels;
    const withoutDragged = panels.filter((p) => p.id !== activeDrag.panelId);
    const clamped = Math.min(insertIdx, withoutDragged.length);
    const result = [...withoutDragged];
    result.splice(clamped, 0, dragged);
    return result;
  }, [panels, activeDrag, isSameSlot, insertIdx]);

  function showContextMenu(panel: SidePanel | null, x: number, y: number) {
    const items: MenuEntry[] = [];
    // Move actions apply to a specific tab; absent when the bar's empty area
    // (spacer) is right-clicked — only the visibility list shows then.
    if (panel) {
      const oppositeColumn: "left" | "right" =
        location === "left" ? "right" : "left";
      const isTop = isTopSlot(slot, location);
      items.push({
        label: `Move to ${oppositeColumn === "left" ? "Left" : "Right"} Panel`,
        run: () => setSidePanelSlot(panel.id, topSlot(oppositeColumn)),
      });
      if (isTop && panels.length > 1) {
        items.push({
          label: "Move to Bottom Pane",
          run: () => setSidePanelSlot(panel.id, bottomSlot(location)),
        });
      }
      if (!isTop) {
        items.push({
          label: "Move to Top Pane",
          run: () => setSidePanelSlot(panel.id, topSlot(location)),
        });
      }
      items.push({ type: "separator" });
    }
    items.push(...sidePanelVisibilityItems());
    void openMenu({ items, at: { x, y } });
  }

  function onBarContextMenu(e: React.MouseEvent<HTMLDivElement>) {
    e.preventDefault();
    const button = (e.target as HTMLElement).closest<HTMLButtonElement>(
      "button.tab",
    );
    const panel = button?.dataset.panelId
      ? (panels.find((p) => p.id === button.dataset.panelId) ?? null)
      : null;
    showContextMenu(panel, e.clientX, e.clientY);
  }

  return (
    <div
      ref={barRef}
      className="panel-header tabs"
      onPointerDown={onBarPointerDown}
      onPointerMove={onBarPointerMove}
      onPointerUp={onBarPointerUp}
      onPointerCancel={onBarPointerCancel}
      onContextMenu={onBarContextMenu}
    >
      {displayPanels.map((p) => (
        <button
          key={p.id}
          type="button"
          data-panel-id={p.id}
          className={[
            "tab",
            activeId === p.id ? "active" : "",
            activeDrag?.panelId === p.id ? "tab-dragging" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          {p.title}
        </button>
      ))}
      <span className="spacer" />
    </div>
  );
}

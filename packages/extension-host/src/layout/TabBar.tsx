import { useMemo, useRef, useState } from "react";
import { openMenu } from "../extension-host/menu-controller";
import type { MenuEntry } from "@silo-code/sdk";
import type { SidePanel } from "@silo-code/sdk";
import {
  store,
  setSidePanelSlot,
  reorderSidePanels,
  splitSideDock,
} from "../state/store";
import { firstPaneId, type InsertSide } from "../state/side-dock-tree";
import { sideTabDrag } from "./drag-state";
import {
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

  function commitDrop(x: number, y: number, draggedPanelId: string) {
    const dropInfo = getDropInfo(x, y);
    if (!dropInfo) {
      sideTabDrag.set(null);
      setInsertIdx(null);
      return;
    }

    const { slot: targetSlot, zone } = dropInfo;

    // Splitting a pane with the only tab it has would empty the pane it came
    // from, which retires it right back — a no-op that leaves a stray pane in
    // the tree on the way. Same rule the Split Right / Split Down menu items
    // follow.
    const wouldEmptySource = targetSlot === slot && panels.length < 2;

    if (zone !== "center" && !wouldEmptySource) {
      // An edge: split the target pane and land in the new one. `getDropInfo`
      // only reports an edge a split actually fits in, so there is nothing to
      // re-check here. Works the same whichever dock the target is in — pane
      // ids are unique across both, so this stays one placement write.
      const newPaneId = splitSideDock(targetSlot, zone);
      if (newPaneId) setSidePanelSlot(draggedPanelId, newPaneId);
    } else if (targetSlot === slot) {
      // Same pane: a reorder.
      const withoutDragged = panels.filter((p) => p.id !== draggedPanelId);
      const idx = Math.min(
        insertIdx ?? withoutDragged.length,
        withoutDragged.length,
      );
      withoutDragged.splice(idx, 0, { id: draggedPanelId } as SidePanel);
      setSidePanelSlot(draggedPanelId, slot);
      reorderSidePanels(withoutDragged.map((p) => p.id));
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
      items.push({
        label: `Move to ${oppositeColumn === "left" ? "Left" : "Right"} Panel`,
        // The dock's *first* pane, read at run time — not the literal string
        // "left"/"right". Splitting a dock's root pane to its left or top puts
        // a minted pane in front, so the two stopped being the same thing.
        run: () =>
          setSidePanelSlot(
            panel.id,
            firstPaneId(store.sideDockTrees[oppositeColumn]),
          ),
      });
      // Splitting needs somewhere for the panel to come *from*: peeling the
      // only tab out of a pane into a new pane beside it would leave the
      // original empty, which prunes it straight back.
      if (panels.length > 1) {
        const splitInto = (side: InsertSide) => () => {
          const newPaneId = splitSideDock(slot, side);
          if (newPaneId) setSidePanelSlot(panel.id, newPaneId);
        };
        items.push({ label: "Split Right", run: splitInto("right") });
        items.push({ label: "Split Down", run: splitInto("bottom") });
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

// Floating drag chip + ALT-mode panel overlay for file-tree drags.
//
// Default: drop opens the file in a new pane (dockview's normal blue
// split/tab overlay handles the destination). ALT-held: drop pastes the
// filename into whichever panel is under the cursor — terminal pastes into
// the shell, editor inserts at the caret. A full-panel highlight replaces
// dockview's edge overlay so the user can see "the whole panel is the paste
// target" rather than split zones.

import { isPasteModifierActive, isPasteModifierHeld } from "./alt-tracker";
import "./file-drag-ghost.css";

const EMPTY_DRAG_IMAGE: HTMLImageElement = (() => {
  const img = new Image();
  // 1×1 transparent gif — hides the native drag preview so only our chip is visible.
  img.src =
    "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";
  return img;
})();

type Mode = "new-pane" | "paste";

const MODE_LABEL: Record<Mode, (name: string) => string> = {
  "new-pane": () => "Press SHIFT to paste",
  paste: (name) => `Pasting ${name}`,
};

// Returns the dockview content-container under the cursor, or null. Used to
// position the ALT-mode paste overlay over the exact panel the user is
// hovering. Tabs and dock chrome return null so the overlay only appears on
// drop-eligible surfaces.
function panelUnderPoint(x: number, y: number): HTMLElement | null {
  const el = document.elementFromPoint(x, y) as HTMLElement | null;
  return (el?.closest(".dv-content-container") as HTMLElement | null) ?? null;
}

// Accepts either a React.DragEvent (from file-tree drags) or a raw DragEvent
// (from dockview's `onWillDragPanel`).
type GhostStartEvent = {
  dataTransfer: DataTransfer | null;
  clientX: number;
  clientY: number;
};

export function startFileDragGhost(name: string, event: GhostStartEvent) {
  if (!event.dataTransfer) return;
  event.dataTransfer.setDragImage(EMPTY_DRAG_IMAGE, 0, 0);

  // --- Floating chip near cursor -------------------------------------------
  const ghost = document.createElement("div");
  ghost.className = "file-drag-ghost";
  const nameEl = document.createElement("div");
  nameEl.className = "g-name";
  nameEl.textContent = name;
  const actionEl = document.createElement("div");
  actionEl.className = "g-action";
  ghost.append(nameEl, actionEl);
  document.body.appendChild(ghost);

  // --- ALT-mode full-panel overlay -----------------------------------------
  const pasteOverlay = document.createElement("div");
  pasteOverlay.className = "paste-overlay";
  pasteOverlay.style.display = "none";
  document.body.appendChild(pasteOverlay);
  let overlayPanel: HTMLElement | null = null;

  // --- Mode state ----------------------------------------------------------
  let mode: Mode = "new-pane";
  let lastX = event.clientX;
  let lastY = event.clientY;

  // Whether the cursor is currently over a dockview panel (editor/terminal)
  let overDockPanel = false;

  function applyMode() {
    ghost.dataset.mode = mode;
    if (mode === "paste") {
      actionEl.textContent = MODE_LABEL["paste"](name);
      positionPasteOverlay();
    } else {
      actionEl.textContent = overDockPanel ? MODE_LABEL["new-pane"](name) : "";
      hidePasteOverlay();
    }
  }
  function setMode(next: Mode) {
    if (next === mode) return;
    mode = next;
    applyMode();
  }
  function positionGhost(x: number, y: number) {
    ghost.style.transform = `translate(${x + 14}px, ${y + 14}px)`;
  }
  function positionPasteOverlay() {
    const panel = panelUnderPoint(lastX, lastY);
    if (!panel) {
      hidePasteOverlay();
      return;
    }
    if (panel !== overlayPanel) {
      overlayPanel = panel;
    }
    const rect = panel.getBoundingClientRect();
    pasteOverlay.style.display = "block";
    pasteOverlay.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
    pasteOverlay.style.width = `${rect.width}px`;
    pasteOverlay.style.height = `${rect.height}px`;
  }
  function hidePasteOverlay() {
    pasteOverlay.style.display = "none";
    overlayPanel = null;
  }

  positionGhost(lastX, lastY);
  // Force the initial label/state — `setMode` short-circuits when the new
  // mode equals the current one, so without this the label would stay
  // empty until the user actually pressed Shift.
  mode = isPasteModifierHeld() ? "paste" : "new-pane";
  applyMode();

  function onDragOver(e: DragEvent) {
    lastX = e.clientX;
    lastY = e.clientY;
    // Use e.target (reliable during drag) to detect dockview panels
    overDockPanel = !!(e.target as Element | null)?.closest?.(
      ".dv-content-container",
    );
    positionGhost(lastX, lastY);
    const nextMode = isPasteModifierActive(e) ? "paste" : "new-pane";
    if (nextMode !== mode) {
      mode = nextMode;
      applyMode();
    } else {
      // Mode unchanged but overDockPanel may have changed — refresh hint text
      if (mode === "new-pane")
        actionEl.textContent = overDockPanel
          ? MODE_LABEL["new-pane"](name)
          : "";
    }
    if (mode === "paste") positionPasteOverlay();
  }
  // Cheap rAF poll while dragging — WebKit suppresses keydown/keyup during
  // an HTML5 drag, so this is the only way to react to Shift being pressed
  // mid-drag when the cursor is stationary. The tracker itself listens on
  // window keydown/keyup outside the drag, and those events DO survive in
  // most cases, so this poll usually picks up the state change within a
  // frame.
  let rafId = 0;
  function poll() {
    setMode(isPasteModifierHeld() ? "paste" : "new-pane");
    if (mode === "paste") positionPasteOverlay();
    rafId = requestAnimationFrame(poll);
  }
  rafId = requestAnimationFrame(poll);

  function cleanup() {
    cancelAnimationFrame(rafId);
    ghost.remove();
    pasteOverlay.remove();
    document.removeEventListener("dragover", onDragOver, true);
    document.removeEventListener("dragend", cleanup, true);
    document.removeEventListener("drop", cleanup, true);
  }
  document.addEventListener("dragover", onDragOver, true);
  document.addEventListener("dragend", cleanup, true);
  document.addEventListener("drop", cleanup, true);
}

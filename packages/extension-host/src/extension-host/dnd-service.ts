import { startFileDragGhost } from "./file-drag-ghost";
import { isPasteModifierActive } from "./alt-tracker";
import type { DndService, DndItem, DndMode, DropContext } from "@silo-code/sdk";

// `ctx.dnd` — the public contract (incl. the DND_MIME vocabulary) lives in
// @silo-code/sdk (dnd-service.ts); this is the host implementation that owns the
// floating drag chip + paste-mode overlay and the modifier-mode resolution.

let service: DndService | null = null;

function accepted(dt: DataTransfer | null, accepts: string[]): boolean {
  if (!dt) return false;
  return accepts.some((m) => dt.types.includes(m));
}

function readItems(dt: DataTransfer | null, accepts: string[]): DndItem[] {
  if (!dt) return [];
  const items: DndItem[] = [];
  for (const mime of accepts) {
    if (!dt.types.includes(mime)) continue;
    const value = dt.getData(mime);
    if (value) items.push({ mime, value });
  }
  return items;
}

/**
 * Resolve the drag {@link DndMode} from an event's held modifiers (Shift ⇒
 * `"paste"`), robust to WebKit suppressing key events mid-drag. Used internally
 * by {@link DndService.registerDropTarget}, and shared with host drop
 * arbitration (the workspace dock) so paste-vs-copy resolution lives in one
 * place rather than leaking the `alt-tracker` internal to callers.
 *
 * @internal
 */
export function resolveDndMode(event: { shiftKey: boolean }): DndMode {
  return isPasteModifierActive(event) ? "paste" : "copy";
}

/** @internal — host factory; extensions receive this as `ctx.dnd`. */
export function getDndService(): DndService {
  if (service) return service;
  service = {
    beginDrag(event, init) {
      const dt = event.dataTransfer;
      if (!dt) return;
      for (const { mime, value } of init.items) dt.setData(mime, value);
      dt.effectAllowed = init.effect ?? "copyMove";
      // The ghost hides the native preview (setDragImage) and renders the chip
      // + paste overlay; it polls the modifier so the overlay flips live.
      startFileDragGhost(init.label, event);
    },
    registerDropTarget(el, handlers) {
      const capture = handlers.capture ?? false;
      const ctxFor = (e: DragEvent): DropContext => ({
        items: readItems(e.dataTransfer, handlers.accepts),
        mode: resolveDndMode(e),
        clientX: e.clientX,
        clientY: e.clientY,
        nativeEvent: e,
      });

      const onDragOver = (e: DragEvent) => {
        if (!accepted(e.dataTransfer, handlers.accepts)) return;
        // Required to make the element a valid drop target.
        e.preventDefault();
        const effect = handlers.onDragOver?.(ctxFor(e));
        if (effect && e.dataTransfer) e.dataTransfer.dropEffect = effect;
      };
      const onDrop = (e: DragEvent) => {
        if (!accepted(e.dataTransfer, handlers.accepts)) return;
        const handled = handlers.onDrop(ctxFor(e));
        if (handled) {
          e.preventDefault();
          e.stopPropagation();
        }
      };
      const onDragLeave = (e: DragEvent) => handlers.onDragLeave?.(e);

      el.addEventListener("dragover", onDragOver, capture);
      el.addEventListener("drop", onDrop, capture);
      if (handlers.onDragLeave)
        el.addEventListener("dragleave", onDragLeave, capture);
      return {
        dispose() {
          el.removeEventListener("dragover", onDragOver, capture);
          el.removeEventListener("drop", onDrop, capture);
          el.removeEventListener("dragleave", onDragLeave, capture);
        },
      };
    },
  };
  return service;
}

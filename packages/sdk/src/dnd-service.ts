import type React from "react";
import type { Disposable } from "./types";

// `ctx.dnd` — first-class drag-and-drop for extensions (public contract). The
// host owns the affordance (the floating drag chip + paste-mode overlay) and
// the modifier-mode resolution; the implementation lives in the extension host.

/**
 * Well-known MIME types for Silo drag payloads. Use these constants (rather than
 * raw strings) so drags interoperate across extensions and built-ins.
 *
 * @category Core Types
 * @public
 */
export const DND_MIME = {
  /** Absolute filesystem path of a file or directory being dragged. */
  filePath: "application/x-silo-file-path",
  /** Plain-text payload (mirrors the path today). */
  text: "text/plain",
} as const;

/**
 * A MIME type from the {@link DND_MIME} vocabulary.
 *
 * @category Core Types
 * @public
 */
export type DndMime = (typeof DND_MIME)[keyof typeof DND_MIME];

/**
 * One typed item carried by a drag — a MIME type plus its string payload.
 *
 * @category Core Types
 * @public
 */
export interface DndItem {
  /** The item's MIME type; use a {@link DND_MIME} constant for interop. */
  mime: string;
  /** The string payload (e.g. an absolute path for {@link DND_MIME.filePath}). */
  value: string;
}

/**
 * What a drag carries and how its chip should read, passed to
 * {@link DndService.beginDrag}.
 *
 * @category Core Types
 * @public
 */
export interface DragInit {
  /** Typed payload items written onto the native `dataTransfer`. */
  items: DndItem[];
  /** Label shown in the floating drag chip (e.g. the file name). */
  label: string;
  /** `dataTransfer.effectAllowed`; defaults to `"copyMove"`. */
  effect?: "copy" | "move" | "copyMove";
}

/**
 * The interaction mode resolved from held modifiers at hover/drop time:
 * `"copy"` is the default (e.g. open / split); `"paste"` is Shift-held (e.g.
 * insert path at caret / paste into the terminal). Resolved robustly even when
 * WebKit suppresses key events mid-drag.
 *
 * @category Core Types
 * @public
 */
export type DndMode = "copy" | "paste";

/**
 * Context delivered to a {@link DropTargetHandlers} callback for a drag over or
 * drop on a registered target.
 *
 * @category Core Types
 * @public
 */
export interface DropContext {
  /**
   * Typed items read from the native `dataTransfer`. Populated on `drop`;
   * during `dragover` the browser exposes only MIME *types* (not values), so
   * this may be empty there — branch on {@link DropContext.mode} / the target's
   * `accepts` instead.
   */
  items: DndItem[];
  /** The resolved modifier mode (Shift ⇒ `"paste"`). */
  mode: DndMode;
  /** Pointer X in client coordinates. */
  clientX: number;
  /** Pointer Y in client coordinates. */
  clientY: number;
  /** The underlying native event (escape hatch for advanced callers). */
  nativeEvent: DragEvent;
}

/**
 * Handlers for a target registered via {@link DndService.registerDropTarget}.
 *
 * @category Core Types
 * @public
 */
export interface DropTargetHandlers {
  /** MIME types this target consumes; a drag is accepted if it carries one. */
  accepts: string[];
  /**
   * Called on a matching drop. Return `true` if you handled it — the host then
   * calls `preventDefault()` + `stopPropagation()` so the drop does **not**
   * fall through to other targets (e.g. the center dock opening a new pane).
   */
  onDrop(ctx: DropContext): boolean | void;
  /**
   * Optional: called on each accepted drag-over (drive hover styling). Return a
   * drop effect to set the cursor, or nothing to leave it. The host already
   * calls `preventDefault()` so the drop is allowed.
   */
  onDragOver?(ctx: DropContext): "copy" | "move" | "none" | void;
  /**
   * Optional: the pointer left the target (clear hover styling). Receives the
   * native event so callers can ignore leaves into a descendant
   * (`el.contains(e.relatedTarget)`).
   */
  onDragLeave?(e: DragEvent): void;
  /**
   * Attach listeners in the capture phase so this target intercepts before
   * bubble-phase handlers (e.g. the center dock). Defaults to `false`.
   */
  capture?: boolean;
}

/**
 * The drag-and-drop domain, exposed as {@link ExtensionContext.dnd}. Be a drag
 * source with {@link DndService.beginDrag} and a drop target with
 * {@link DndService.registerDropTarget}; payloads are typed via {@link DND_MIME}.
 *
 * @category Consumer Services
 * @public
 */
export interface DndService {
  /**
   * Begin a drag from inside a `dragstart` handler: writes the typed
   * {@link DragInit.items} onto the native `dataTransfer`, hides the native
   * drag preview, and starts the floating chip + paste-mode overlay affordance.
   * Must be called synchronously within the `dragstart` event.
   */
  beginDrag(event: DragEvent | React.DragEvent, init: DragInit): void;
  /**
   * Register `el` as a drop target. The host attaches the drag listeners,
   * resolves the modifier {@link DndMode}, and delivers a {@link DropContext}.
   * Returns a {@link Disposable} that removes the listeners.
   */
  registerDropTarget(el: HTMLElement, handlers: DropTargetHandlers): Disposable;
}

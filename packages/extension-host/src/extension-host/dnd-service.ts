import { startFileDragGhost } from "./file-drag-ghost";
import { isPasteModifierActive } from "./alt-tracker";
import type {
  DndService,
  DndItem,
  DndMode,
  DropContext,
  DropTargetHandlers,
} from "@silo-code/sdk";
import { DND_MIME } from "@silo-code/sdk";

// `ctx.dnd` — the public contract (incl. the DND_MIME vocabulary) lives in
// @silo-code/sdk (dnd-service.ts); this is the host implementation that owns the
// floating drag chip + paste-mode overlay, modifier-mode resolution, and the
// window-level listener that routes Finder file drags to registered targets.

// Registry: every active registerDropTarget call adds its element here so the
// window-level native-drop handler can find the right target via hit-test + DOM walk.
const registry = new Map<HTMLElement, DropTargetHandlers>();

let service: DndService | null = null;

// ── native Finder drop state ─────────────────────────────────────────────────

let nativeHoveredHandlers: DropTargetHandlers | null = null;
// Paths captured during draggingEntered: by the Rust swizzle, fetched async
// via prefetchFinderPaths() on the first dragover, used synchronously on drop.
let finderDragPaths: string[] | null = null;
let finderDragFetching = false;
// Incremented on every clearFinderDragCache() call; each async prefetch chain
// checks the counter before writing so stale results don't overwrite a newer drag.
let finderDragSession = 0;

// ── helpers ──────────────────────────────────────────────────────────────────

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

/** True only for Finder/OS file drags (not internal Silo drags). */
function isExternalFileDrag(dt: DataTransfer | null): boolean {
  if (!dt) return false;
  return dt.types.includes("Files") && !dt.types.includes(DND_MIME.filePath);
}

/**
 * Walk up the DOM from `el` until we find a registered ancestor that
 * accepts at least one of `mimes`.
 */
function findDropTarget(
  el: Element | null,
  mimes: string[],
): DropTargetHandlers | null {
  let node: Element | null = el;
  while (node) {
    const handlers = registry.get(node as HTMLElement);
    if (handlers && mimes.some((m) => handlers.accepts.includes(m))) {
      return handlers;
    }
    node = node.parentElement;
  }
  return null;
}

function parseUriList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((uri) => {
      try {
        const u = new URL(uri);
        return u.protocol === "file:" ? decodeURIComponent(u.pathname) : "";
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}

/**
 * Kick off a background fetch of the file paths captured by the Rust swizzle
 * during the current drag session. Called on the FIRST dragover so the result
 * is ready (or nearly ready) by the time the user drops.
 *
 * Note: text/uri-list is always empty in WKWebView when dragDropEnabled:false,
 * so we must retrieve paths through the swizzle-backed Tauri command.
 */
function prefetchFinderPaths(): void {
  if (finderDragPaths !== null || finderDragFetching) return;
  finderDragFetching = true;
  const session = finderDragSession;
  void import("@tauri-apps/api/core")
    .then(({ invoke }) => invoke<string[]>("dnd_get_finder_paths"))
    .then((paths) => {
      if (finderDragSession === session) finderDragPaths = paths;
    })
    .catch(() => {
      if (finderDragSession === session) finderDragPaths = [];
    })
    .finally(() => {
      if (finderDragSession === session) finderDragFetching = false;
    });
}

function clearFinderDragCache(): void {
  finderDragPaths = null;
  finderDragFetching = false;
  finderDragSession++;
}

// ── window-level Finder drop routing ─────────────────────────────────────────

/**
 * Attach window-level capture listeners that intercept external (Finder) file
 * drags. Internal Silo drags carry DND_MIME.filePath and are handled at the
 * element level by registerDropTarget; external drags carry "Files" and need
 * special routing because dt.getData("text/uri-list") is always empty in
 * WKWebView with dragDropEnabled:false.
 */
function subscribeToNativeFileDrop(): void {
  window.addEventListener(
    "dragover",
    (e: DragEvent) => {
      if (!isExternalFileDrag(e.dataTransfer)) return;
      // Start the async path fetch on the very first dragover so it's ready
      // (or close to ready) when the user lifts the mouse.
      prefetchFinderPaths();
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const handlers = findDropTarget(el, [DND_MIME.filePath]);
      nativeHoveredHandlers = handlers;
      if (!handlers) return;
      e.preventDefault();
      e.stopPropagation();
      const effect = handlers.onDragOver?.({
        items: [],
        mode: "paste",
        clientX: e.clientX,
        clientY: e.clientY,
        nativeEvent: e,
      });
      if (effect && e.dataTransfer) e.dataTransfer.dropEffect = effect;
    },
    true,
  );

  window.addEventListener(
    "dragleave",
    (e: DragEvent) => {
      if (!isExternalFileDrag(e.dataTransfer)) return;
      // Only clear when the drag has fully left the browser window.
      // Intra-DOM dragleaves (e.relatedTarget !== null) are noise.
      if (e.relatedTarget !== null) return;
      nativeHoveredHandlers?.onDragLeave?.(e);
      nativeHoveredHandlers = null;
      clearFinderDragCache();
    },
    true,
  );

  window.addEventListener(
    "drop",
    (e: DragEvent) => {
      if (!isExternalFileDrag(e.dataTransfer)) return;
      e.preventDefault();
      e.stopPropagation();
      nativeHoveredHandlers = null;
      const clientX = e.clientX;
      const clientY = e.clientY;
      const el = document.elementFromPoint(clientX, clientY);
      const handlers = findDropTarget(el, [DND_MIME.filePath]);
      if (!handlers) {
        clearFinderDragCache();
        return;
      }
      // text/uri-list is always empty in WKWebView with dragDropEnabled:false.
      // Fall back to the swizzle-prefetched paths.
      let paths = parseUriList(e.dataTransfer?.getData("text/uri-list") ?? "");
      if (!paths.length) paths = finderDragPaths ?? [];
      clearFinderDragCache();
      if (!paths.length) return;
      handlers.onDrop({
        items: paths.map((p) => ({ mime: DND_MIME.filePath, value: p })),
        mode: "paste",
        clientX,
        clientY,
        nativeEvent: e,
      });
    },
    true,
  );
}

// ── public API ────────────────────────────────────────────────────────────────

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
  subscribeToNativeFileDrop();
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
      registry.set(el, handlers);
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
          registry.delete(el);
          el.removeEventListener("dragover", onDragOver, capture);
          el.removeEventListener("drop", onDrop, capture);
          el.removeEventListener("dragleave", onDragLeave, capture);
        },
      };
    },
  };
  return service;
}

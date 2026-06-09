import type { MenuEntry } from "@silo-code/sdk";

// Host-side controller behind every floating menu — the single open-menu
// surface. Mirrors the toast pattern in `ui-service.ts` (one piece of
// app-shell state + a host component that renders it), but uses a plain
// subscribe/getSnapshot store consumed via `useSyncExternalStore` (like the
// contribution registries) rather than a valtio proxy: a menu spec carries
// callbacks and React nodes (`icon`), which don't belong in a deeply-frozen
// snapshot.
//
// Extensions reach this only through `ctx.ui.showMenu`. Host chrome
// (TabBar, GroupAddMenu) may call `openMenu` directly. There is exactly one
// open menu at a time; opening a second resolves and replaces the first —
// except that re-opening with the same `anchor` toggles the menu closed (a
// second click on a dropdown button dismisses it; opt out with `toggle: false`).

/** @internal — where to place a menu. Resolution order: anchor → at → cursor. */
export interface MenuPlacement {
  /** Explicit viewport point (right-click menus). */
  at?: { x: number; y: number };
  /** Anchor element to hang the menu off (button dropdowns). */
  anchor?: HTMLElement | null;
  /** Horizontal alignment relative to the anchor. Default `"start"`. */
  align?: "start" | "end";
  /**
   * Which side of the anchor to open on. `"bottom"` (default) hangs the menu
   * below the anchor, flipping above when cramped; `"right"` opens it beside the
   * anchor (top-aligned), flipping to the left when cramped — used for cascading
   * submenus, never set by `showMenu` callers.
   */
  side?: "bottom" | "right";
}

/** @internal — the argument to {@link openMenu} / `ctx.ui.showMenu`. */
export interface OpenMenuSpec extends MenuPlacement {
  items: MenuEntry[];
  /**
   * Anchored-dropdown toggle. When `true` (default), re-opening with the same
   * `anchor` while that menu is open closes it; `false` keeps the legacy
   * always-(re)open behaviour. No effect without an `anchor`. See
   * `ShowMenuOptions.toggle` in `@silo-code/sdk`.
   */
  toggle?: boolean;
}

/** @internal — the live open-menu record, including its promise resolver. */
export interface MenuSpec extends OpenMenuSpec {
  id: number;
  resolve: () => void;
}

let current: MenuSpec | null = null;
let nextId = 0;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** @internal — `useSyncExternalStore` subscribe. */
export function subscribeMenu(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** @internal — `useSyncExternalStore` snapshot; the open menu or `null`. */
export function getMenu(): MenuSpec | null {
  return current;
}

/**
 * Open a menu, resolving the returned promise when an item runs or the menu is
 * dismissed (click-outside / Escape / another `openMenu`). Single-open: a prior
 * menu is dismissed and resolved first.
 *
 * **Toggle** (default on, see {@link OpenMenuSpec.toggle}): re-opening with the
 * same `anchor` that's already showing closes the menu instead of reopening it,
 * so a second click on a dropdown button dismisses it. Cursor/`at` menus (no
 * `anchor`) always (re)open.
 *
 * @internal
 */
export function openMenu(spec: OpenMenuSpec): Promise<void> {
  if (spec.toggle !== false && spec.anchor && current?.anchor === spec.anchor) {
    closeMenu();
    return Promise.resolve();
  }
  closeMenu();
  return new Promise<void>((resolve) => {
    current = { ...spec, id: nextId++, resolve };
    emit();
  });
}

/** @internal — dismiss the open menu (if any) and resolve its promise. */
export function closeMenu(): void {
  const c = current;
  if (!c) return;
  current = null;
  emit();
  c.resolve();
}

// ── Global document handlers ───────────────────────────────────────────────
// Two responsibilities, both installed once from the host `<Menus>` layer
// (guaranteed a browser context):
//
// 1. Pointer tracking — so `ctx.ui.showMenu({ items })` with no `at`/`anchor`
//    opens at the cursor. A `contextmenu` event fires immediately before a
//    right-click handler runs, so the last recorded point is the exact click.
//
// 2. Native-menu suppression — the webview (WKWebView) pops its own
//    "Reload / Inspect Element" menu anywhere a right-click isn't handled.
//    Silo owns its context menus, so we suppress the native one app-wide;
//    surfaces that want a menu open ours via their own `onContextMenu`
//    (which still fires — `preventDefault` blocks only the default action,
//    not propagation). In dev, holding Shift falls through to the native menu
//    so "Inspect Element" stays reachable while debugging.

let lastPointer = { x: 0, y: 0 };
let handlersInstalled = false;

/** @internal — current cursor position, used as the default menu origin. */
export function getLastPointer(): { x: number; y: number } {
  return lastPointer;
}

/** @internal — install the document-level menu handlers once. */
export function installMenuGlobals(): void {
  if (handlersInstalled || typeof document === "undefined") return;
  handlersInstalled = true;
  const track = (e: PointerEvent | MouseEvent) => {
    lastPointer = { x: e.clientX, y: e.clientY };
  };
  document.addEventListener("pointermove", track, true);
  document.addEventListener("pointerdown", track, true);
  document.addEventListener(
    "contextmenu",
    (e) => {
      track(e);
      if (import.meta.env.DEV && e.shiftKey) return;
      e.preventDefault();
    },
    true,
  );
}

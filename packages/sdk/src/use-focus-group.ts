import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";

/**
 * The arrow-key axis a {@link useFocusGroup} navigates.
 *
 * - `"vertical"` — ↑/↓ move between items (lists, menus, listboxes).
 * - `"horizontal"` — ←/→ move between items (toolbars, tablists, button groups).
 * - `"grid"` — all four arrows step linearly through the items (a flat picker);
 *   `Home`/`End` still jump to the ends regardless of orientation.
 *
 * @category Core Types
 * @public
 */
export type FocusGroupOrientation = "vertical" | "horizontal" | "grid";

/**
 * Options for {@link useFocusGroup}. Describe the set of peer items and what
 * `Enter`/the context-menu key should do; the hook owns the rest (single tab
 * stop, arrow/Home/End movement, the keyboard-only ring).
 *
 * @category Core Types
 * @public
 */
export interface FocusGroupOptions {
  /** Number of items in the group. */
  count: number;
  /**
   * The index focus enters on (the host's "first tabbable" lands here, e.g. the
   * selected row). Re-parked here whenever the group doesn't hold focus, so a
   * fresh entry always starts on it. Default `0`. Skipped to the nearest
   * navigable index if {@link FocusGroupOptions.isNavigable | isNavigable} rejects it.
   */
  start?: number;
  /** Arrow-key axis. Default `"vertical"`. */
  orientation?: FocusGroupOrientation;
  /** Wrap past the ends (default `true`) vs. stop at the first/last item. */
  wrap?: boolean;
  /**
   * Which indices accept focus; others (separators, headers, disabled rows) are
   * skipped by the arrows, Home/End, and the entry point. Default: all navigable.
   */
  isNavigable?: (index: number) => boolean;
  /** `Enter`/`Space` on an item. */
  onActivate?: (index: number) => void;
  /**
   * The context-menu key / `Shift`+`F10` on an item; `anchor` is the item's DOM
   * element, so a menu can be positioned against the row.
   */
  onMenu?: (index: number, anchor: HTMLElement) => void;
}

/**
 * Props {@link useFocusGroup} returns for the group container — spread onto the
 * element wrapping the items.
 *
 * @category Core Types
 * @public
 */
export interface FocusGroupContainerProps {
  onBlur: (e: FocusEvent) => void;
}

/**
 * Props {@link useFocusGroup} returns per item — spread onto item `index`. They
 * carry the single-tab-stop `tabIndex`, the key/focus handlers, and the
 * `data-focus-*` markers the host's CSS styles into the keyboard ring. Your own
 * `role`/`aria-*`/`onClick`/`className` sit alongside them.
 *
 * @category Core Types
 * @public
 */
export interface FocusGroupItemProps {
  tabIndex: number;
  ref: (el: HTMLElement | null) => void;
  onKeyDown: (e: KeyboardEvent) => void;
  onFocus: () => void;
  onPointerDown: (e: PointerEvent) => void;
  /** Marks every group item, so the host can reset the native focus outline. */
  "data-focus-item": "";
  /**
   * Present on the active item only while focus is keyboard-driven — the host's
   * CSS keys the ring on it. Absent for pointer focus, matching `:focus-visible`.
   */
  "data-focus-visible"?: "";
}

/**
 * The headless focus-group controller {@link useFocusGroup} returns.
 *
 * @category Core Types
 * @public
 */
export interface FocusGroup {
  /** Spread on the group container. */
  containerProps: FocusGroupContainerProps;
  /** Spread on item `index`. */
  getItemProps: (index: number) => FocusGroupItemProps;
  /** The item that currently holds (or, when unfocused, would receive) focus. */
  activeIndex: number;
  /** Imperatively move focus to an item (e.g. `↓` from a search box into a list). */
  focusItem: (index: number) => void;
}

const clamp = (n: number, max: number): number => Math.max(0, Math.min(n, max));

/** First navigable index at or after scanning the whole list, or `null`. */
function firstNavigable(
  count: number,
  isNavigable: (i: number) => boolean,
): number | null {
  for (let i = 0; i < count; i++) if (isNavigable(i)) return i;
  return null;
}

/** Last navigable index, or `null`. */
function lastNavigable(
  count: number,
  isNavigable: (i: number) => boolean,
): number | null {
  for (let i = count - 1; i >= 0; i--) if (isNavigable(i)) return i;
  return null;
}

/**
 * A roving-navigation query for {@link focusGroupNextIndex}.
 *
 * @category Core Types
 * @public
 */
export interface FocusGroupNavQuery {
  /** The index focus is on now. */
  current: number;
  /** Number of items. */
  count: number;
  /** The pressed key (`ArrowDown`/`ArrowUp`/`ArrowLeft`/`ArrowRight`/`Home`/`End`). */
  key: string;
  /** Which arrows navigate. */
  orientation: FocusGroupOrientation;
  /** Wrap past the ends vs. stop. */
  wrap: boolean;
  /** Which indices accept focus; others are skipped. */
  isNavigable: (index: number) => boolean;
}

/**
 * The index a navigation key moves focus to within a focus group, or `null` when
 * the key isn't a navigation key for this orientation, the list is empty, or no
 * other navigable item exists. Steps over non-navigable items; wraps at the ends
 * when `wrap`, otherwise stops (returns `null`). `Home`/`End` jump to the
 * first/last navigable index regardless of orientation.
 *
 * This is the pure roving-index core that {@link useFocusGroup} runs internally.
 * Reach for it directly only when you **can't** use the hook — e.g. a widget that
 * drives keys from a document-level listener and a state-driven highlight rather
 * than DOM focus (Silo's menus work this way). For an ordinary list/toolbar,
 * prefer {@link useFocusGroup}, which calls this for you.
 *
 * @example
 * ```ts
 * const next = focusGroupNextIndex({
 *   current: activeIndex, count: items.length, key: e.key,
 *   orientation: "vertical", wrap: true,
 *   isNavigable: (i) => !items[i].disabled,
 * });
 * if (next !== null) setActiveIndex(next);
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function focusGroupNextIndex(params: FocusGroupNavQuery): number | null {
  const { current, count, key, orientation, wrap, isNavigable } = params;
  if (count <= 0) return null;
  if (key === "Home") return firstNavigable(count, isNavigable);
  if (key === "End") return lastNavigable(count, isNavigable);

  const vertical = orientation === "vertical" || orientation === "grid";
  const horizontal = orientation === "horizontal" || orientation === "grid";
  let dir: 1 | -1 | 0 = 0;
  if ((vertical && key === "ArrowDown") || (horizontal && key === "ArrowRight"))
    dir = 1;
  else if (
    (vertical && key === "ArrowUp") ||
    (horizontal && key === "ArrowLeft")
  )
    dir = -1;
  if (dir === 0) return null;

  let i = current;
  for (let n = 0; n < count; n++) {
    i += dir;
    if (i < 0 || i >= count) {
      if (!wrap) return null;
      i = (i + count) % count;
    }
    if (i === current) return null; // came all the way around — nothing else navigable
    if (isNavigable(i)) return i;
  }
  return null;
}

/**
 * Whether a keydown should open an item's context menu — the dedicated
 * ContextMenu (Menu/Application) key, or `Shift`+`F10` for keyboards without it.
 *
 * @internal
 */
export function isContextMenuKey(e: {
  key: string;
  shiftKey: boolean;
}): boolean {
  return e.key === "ContextMenu" || (e.shiftKey && e.key === "F10");
}

/**
 * Headless keyboard navigation for a **focus group** — a set of peer items that
 * share a single tab stop and move with the arrow keys (a list, listbox, menu,
 * toolbar, tablist, radio group, or flat grid). It owns, once and correctly, the
 * mechanics every such widget needs:
 *
 * - a single-tab-stop `tabIndex` (one item tabbable, the rest `-1`), so the group
 *   is one Tab stop and the host's "focus the first tabbable" entry lands on
 *   {@link FocusGroupOptions.start | start};
 * - Arrow / Home / End movement (per
 *   {@link FocusGroupOptions.orientation | orientation}, wrapping or stopping per
 *   {@link FocusGroupOptions.wrap | wrap}, skipping non-navigable items);
 * - `Enter`/`Space` → {@link FocusGroupOptions.onActivate | onActivate}, the
 *   context-menu key / `Shift`+`F10` → {@link FocusGroupOptions.onMenu | onMenu};
 * - a **WebKit-safe, keyboard-only focus ring**: it flags the active item with a
 *   `data-focus-visible` attribute (state-driven, because WebKit won't repaint
 *   `:focus` for the programmatic focus the host's region cycle performs), and
 *   the host ships the ring CSS keyed on that attribute — so every group's ring
 *   is identical and correct without the author touching it.
 *
 * You keep the markup and semantics (`role`, `aria-*`, `onClick`, styling); the
 * hook supplies behavior. Spread {@link FocusGroup.containerProps | containerProps}
 * on the wrapper and {@link FocusGroup.getItemProps | getItemProps(i)} on each
 * item. The index is clamped when {@link FocusGroupOptions.count | count} changes,
 * so live-filtering a list is safe.
 *
 * @example
 * ```tsx
 * const group = useFocusGroup({
 *   count: items.length,
 *   start: activeIndex,
 *   onActivate: (i) => select(items[i].id),
 *   onMenu: (i, anchor) => showMenu(items[i], anchor),
 * });
 * return (
 *   <ul {...group.containerProps}>
 *     {items.map((it, i) => (
 *       <li key={it.id} {...group.getItemProps(i)}>{it.label}</li>
 *     ))}
 *   </ul>
 * );
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function useFocusGroup(options: FocusGroupOptions): FocusGroup {
  const {
    count,
    start = 0,
    orientation = "vertical",
    wrap = true,
    isNavigable = () => true,
    onActivate,
    onMenu,
  } = options;

  const [activeIndex, setActiveIndex] = useState(0);
  // Focus is somewhere inside the group (drives re-parking on the active row).
  const [focused, setFocused] = useState(false);
  // Focus arrived/moved via the keyboard (drives the ring), à la `:focus-visible`.
  const [visible, setVisible] = useState(false);

  // The most recent focus was preceded by a pointer-down on an item — so it's a
  // mouse focus and must NOT show the ring. Read+reset on the following onFocus.
  const pointerOrigin = useRef(false);
  const itemEls = useRef<Map<number, HTMLElement>>(new Map());

  // Read latest options in stable handlers without re-creating them each render.
  const opts = useRef({
    count,
    orientation,
    wrap,
    isNavigable,
    onActivate,
    onMenu,
  });
  opts.current = { count, orientation, wrap, isNavigable, onActivate, onMenu };

  // Park the active index on `start` (clamped, and nudged to a navigable item)
  // whenever the group isn't focused, so the host's entry lands there; while
  // focused, just keep the index in range as items come and go.
  useEffect(() => {
    setActiveIndex((i) => {
      if (count <= 0) return 0;
      if (focused) return Math.min(i, count - 1);
      const at = clamp(start, count - 1);
      return isNavigable(at) ? at : (firstNavigable(count, isNavigable) ?? at);
      // isNavigable identity changes per render; `start`/`count`/`focused` are the
      // real inputs — re-running on isNavigable alone would thrash focus.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    });
  }, [start, focused, count]);

  const focusItem = useCallback((index: number) => {
    itemEls.current.get(index)?.focus();
  }, []);

  const containerProps: FocusGroupContainerProps = {
    onBlur: (e: FocusEvent) => {
      // Drop focus state only when focus leaves the whole group (not when it
      // moves between two items).
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
        setFocused(false);
        setVisible(false);
      }
    },
  };

  const getItemProps = (index: number): FocusGroupItemProps => ({
    tabIndex: index === activeIndex ? 0 : -1,
    ref: (el: HTMLElement | null) => {
      if (el) itemEls.current.set(index, el);
      else itemEls.current.delete(index);
    },
    onPointerDown: () => {
      pointerOrigin.current = true;
    },
    onFocus: () => {
      setFocused(true);
      setActiveIndex(index);
      // Keyboard/programmatic focus shows the ring; a pointer-driven focus doesn't.
      setVisible(!pointerOrigin.current);
      pointerOrigin.current = false;
    },
    onKeyDown: (e: KeyboardEvent) => {
      const o = opts.current;
      if (e.key === "Enter" || e.key === " ") {
        if (!o.onActivate) return;
        e.preventDefault();
        setVisible(true);
        o.onActivate(index);
        return;
      }
      if (isContextMenuKey(e)) {
        if (!o.onMenu) return;
        e.preventDefault();
        setVisible(true);
        o.onMenu(index, e.currentTarget as HTMLElement);
        return;
      }
      const next = focusGroupNextIndex({
        current: index,
        count: o.count,
        key: e.key,
        orientation: o.orientation,
        wrap: o.wrap,
        isNavigable: o.isNavigable,
      });
      if (next === null) return;
      e.preventDefault();
      setVisible(true);
      focusItem(next);
    },
    "data-focus-item": "",
    ...(visible && index === activeIndex ? { "data-focus-visible": "" } : {}),
  });

  return { containerProps, getItemProps, activeIndex, focusItem };
}

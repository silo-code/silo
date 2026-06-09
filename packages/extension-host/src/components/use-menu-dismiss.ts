import { useEffect, useLayoutEffect, useState } from "react";
import type { RefObject } from "react";
import {
  getLastPointer,
  type MenuPlacement,
} from "../extension-host/menu-controller";

// The two behaviors every floating menu needs, unified so the six former
// hand-rolled copies (each slightly different) collapse to one implementation.

const PAD = 4; // keep this far from the viewport edge
const GAP = 4; // gap between an anchored menu and its anchor

/**
 * Dismiss the menu on click-outside or Escape. **Capture phase** is mandatory:
 * Monaco and xterm call `stopPropagation()` on mousedown, so a bubble-phase
 * listener never fires for clicks inside the editor/terminal and the menu would
 * need a second click to dismiss. The anchor element is excluded so the click
 * that opened an anchored menu doesn't immediately close it.
 *
 * `insideSelector` extends "inside" beyond `ref` to any element matching the
 * selector — cascading submenus render in their own portals (so `ref.contains`
 * misses them), but every menu in one tree carries the same marker, so a click
 * in a submenu still counts as inside and doesn't dismiss the tree.
 */
export function useMenuDismiss(
  ref: RefObject<HTMLElement | null>,
  anchor: HTMLElement | null | undefined,
  onClose: () => void,
  insideSelector?: string | null,
): void {
  useEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (ref.current?.contains(target)) return;
      if (anchor?.contains(target)) return;
      if (
        insideSelector &&
        target instanceof Element &&
        target.closest(insideSelector)
      )
        return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [ref, anchor, onClose, insideSelector]);
}

interface Pos {
  x: number;
  y: number;
  visible: boolean;
}

/**
 * Place a menu by measuring it off-screen, then clamping into the viewport.
 * One measure-then-place routine covering every mode:
 * - **anchor, `side: "bottom"`** (default) — hang below the anchor, flipping
 *   above it when there's no room below but room above (the status-bar menus,
 *   which sit at the screen bottom, rely on this), aligned to the anchor's left
 *   (`start`) or right (`end`).
 * - **anchor, `side: "right"`** — open beside the anchor, top-aligned with it,
 *   flipping to the left when there's no room on the right (cascading submenus).
 * - **point / cursor** — open at `at`, or the last cursor position when neither
 *   `at` nor `anchor` is given.
 *
 * Returns `visible: false` for the first paint (rendered off-screen) so the
 * menu never flashes at the wrong spot.
 */
export function useMenuPlacement(
  ref: RefObject<HTMLElement | null>,
  placement: MenuPlacement,
): Pos {
  const [pos, setPos] = useState<Pos>({ x: -9999, y: -9999, visible: false });
  const { at, anchor, align, side } = placement;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width: w, height: h } = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let x: number;
    let y: number;

    if (anchor && side === "right") {
      const r = anchor.getBoundingClientRect();
      // Open to the right, flipping left when there's no room but there is left.
      x =
        r.right + GAP > vw - PAD - w && r.left - GAP - w >= PAD
          ? r.left - GAP - w
          : r.right + GAP;
      // Top-align the first submenu row with its parent row (offset the menu's
      // own top padding so the labels line up).
      y = r.top - PAD;
    } else if (anchor) {
      const r = anchor.getBoundingClientRect();
      x = align === "end" ? r.right - w : r.left;
      const below = r.bottom + GAP;
      const above = r.top - GAP - h;
      // Flip above when the menu won't fit below but does fit above.
      y = below + h > vh - PAD && above >= PAD ? above : below;
    } else {
      const point = at ?? getLastPointer();
      x = point.x;
      y = point.y;
    }

    // Clamp into the viewport (covers both modes and the bottom/right edges).
    x = Math.max(PAD, Math.min(x, vw - w - PAD));
    y = Math.max(PAD, Math.min(y, vh - h - PAD));

    setPos({ x, y, visible: true });
    // Anchor is a DOM node (stable per open); align/side/at drive re-placement.
  }, [ref, anchor, align, side, at?.x, at?.y]);

  return pos;
}

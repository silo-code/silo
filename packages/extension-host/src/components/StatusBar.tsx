import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { statusItemRegistry } from "../extension-host/status-items";
import { enterRegionOnPointer } from "../extension-host/focus-regions";
import type { StatusItem } from "@silo-code/sdk";
import { Tooltip } from "./Tooltip";
import { ErrorBoundary } from "./ErrorBoundary";
import "./StatusBar.css";

function useStatusItems(): StatusItem[] {
  return useSyncExternalStore(
    useCallback((cb) => statusItemRegistry.onChange(cb).dispose, []),
    () => statusItemRegistry.list(),
  );
}

function byPriority(a: StatusItem, b: StatusItem): number {
  return (a.priority ?? 0) - (b.priority ?? 0);
}

/**
 * Status-bar focus behavior. The bar isn't a roving focus group (Tab moves
 * between its items naturally), but its keyboard ring uses the **same** mechanism
 * `useFocusGroup` does — the host's `[data-focus-item][data-focus-visible]` CSS —
 * so there's one ring concept across the app (RFC 0012 §2, retiring the old
 * `data-kbd`-on-bar approach):
 *
 * - **Keyboard-only ring.** WebKit doesn't light `:focus-visible` for the
 *   programmatic focus Cmd+Alt+. / Cmd+Alt+, performs (see `cycleRegionFocus`), so we
 *   drive it from state: the focused item gets `data-focus-item` (the host resets
 *   its native outline) and, when focus is keyboard-driven, `data-focus-visible`
 *   (the ring). Pointer focus gets `data-focus-item` only — no ring. Tab flows
 *   naturally out of the bar; we don't trap it.
 * - **Click-to-enter.** Clicking the bar's empty background (not an item) focuses
 *   the first item with the ring — a pointer entry point for tabbing around.
 */
function useStatusBarFocus(ref: React.RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const bar = ref.current;
    if (!bar) return;
    // Was the focus that's about to land driven by a pointer? If so, no ring.
    let pointerOrigin = false;
    // The item currently carrying the focus markers, so we can clear it as focus
    // moves between items or leaves the bar.
    let marked: HTMLElement | null = null;

    const clearMark = () => {
      marked?.removeAttribute("data-focus-item");
      marked?.removeAttribute("data-focus-visible");
      marked = null;
    };
    const mark = (el: HTMLElement, ring: boolean) => {
      if (marked && marked !== el) clearMark();
      el.setAttribute("data-focus-item", "");
      if (ring) el.setAttribute("data-focus-visible", "");
      else el.removeAttribute("data-focus-visible");
      marked = el;
    };

    const onPointerDown = () => {
      pointerOrigin = true;
    };
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target;
      if (!(t instanceof HTMLElement) || !bar.contains(t)) return;
      mark(t, !pointerOrigin);
      pointerOrigin = false;
    };
    const onFocusOut = (e: FocusEvent) => {
      const next = e.relatedTarget;
      if (!(next instanceof Node) || !bar.contains(next)) clearMark();
    };
    const onMouseDown = (e: MouseEvent) => {
      // Click-to-enter is the shared region behavior (enterRegionOnPointer
      // focuses the bar's first item on a background/spacer click, and leaves a
      // clicked item to focus itself). Clicking the empty bar is a keyboard
      // entry point, so light the ring on whatever it focused.
      if (!enterRegionOnPointer(e.target)) return;
      e.preventDefault(); // keep focus on the item we picked, not the bare bar
      const focused = document.activeElement;
      if (focused instanceof HTMLElement && bar.contains(focused)) {
        mark(focused, true);
      }
    };

    bar.addEventListener("pointerdown", onPointerDown, true);
    bar.addEventListener("focusin", onFocusIn);
    bar.addEventListener("focusout", onFocusOut);
    bar.addEventListener("mousedown", onMouseDown);
    return () => {
      bar.removeEventListener("pointerdown", onPointerDown, true);
      bar.removeEventListener("focusin", onFocusIn);
      bar.removeEventListener("focusout", onFocusOut);
      bar.removeEventListener("mousedown", onMouseDown);
      clearMark();
    };
  }, [ref]);
}

function renderItem(item: StatusItem) {
  const inner = item.tooltip ? (
    <Tooltip content={item.tooltip}>
      <item.component />
    </Tooltip>
  ) : (
    <item.component />
  );
  return (
    <ErrorBoundary key={item.id} name={`status:${item.id}`} fallback={null}>
      {inner}
    </ErrorBoundary>
  );
}

export function StatusBar() {
  const items = useStatusItems();
  const ref = useRef<HTMLDivElement>(null);
  useStatusBarFocus(ref);
  const left = items.filter((i) => i.alignment === "left").sort(byPriority);
  const right = items.filter((i) => i.alignment === "right").sort(byPriority);

  return (
    <div className="status-bar" ref={ref}>
      {left.map((item) => renderItem(item))}
      <span className="spacer" />
      {right.map((item) => renderItem(item))}
    </div>
  );
}

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./Tooltip.css";

const DELAY_MS = 600;
const GAP_PX = 6;
const MARGIN_PX = 8;

/**
 * Lightweight custom tooltip — wraps any content, shows a styled popup above the
 * trigger after a hover delay. Renders into a portal so stacking contexts and
 * overflow:hidden parents don't clip it. Display-only: pointer-events: none.
 *
 * Core-only (exported from `@silo-code/extension-host/internal`): extensions get
 * tooltips via the `title` field on `StatusItem` / `MenuItem`, not this component.
 */
export function Tooltip({
  content,
  children,
}: {
  content: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  // anchorCenter is the mid-point of the trigger's top edge (the raw position
  // before clamping). null = tooltip hidden.
  const [anchor, setAnchor] = useState<{ cx: number; top: number } | null>(
    null,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    timer.current = setTimeout(() => {
      const r = ref.current?.getBoundingClientRect();
      if (r) setAnchor({ cx: r.left + r.width / 2, top: r.top - GAP_PX });
    }, DELAY_MS);
  };

  const hide = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setAnchor(null);
  };

  return (
    <span
      ref={ref}
      className="silo-tooltip-host"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {anchor &&
        createPortal(
          <TooltipPopup
            content={content}
            cx={anchor.cx}
            anchorTop={anchor.top}
          />,
          document.body,
        )}
    </span>
  );
}

/** Measures its own rendered width/height then clamps to stay inside the viewport. */
function TooltipPopup({
  content,
  cx,
  anchorTop,
}: {
  content: string;
  cx: number;
  anchorTop: number;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  // Start invisible so the measure pass is invisible to the user.
  const [style, setStyle] = useState<React.CSSProperties>({
    visibility: "hidden",
  });

  useLayoutEffect(() => {
    const el = popupRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;

    // Center horizontally over the anchor, clamped to stay within the viewport.
    const left = Math.max(
      MARGIN_PX,
      Math.min(cx - w / 2, window.innerWidth - w - MARGIN_PX),
    );
    // Position above the anchor's top edge; if that would clip the top of the
    // viewport, flip below (anchorTop + GAP_PX is the anchor's bottom + gap).
    const top =
      anchorTop - h < MARGIN_PX ? anchorTop + GAP_PX * 2 : anchorTop - h;

    setStyle({ left, top, visibility: "visible" });
  }, [cx, anchorTop]);

  return (
    <div ref={popupRef} className="silo-tooltip" style={style}>
      {content}
    </div>
  );
}

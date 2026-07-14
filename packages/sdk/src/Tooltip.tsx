import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const DELAY_MS = 600;
const GAP_PX = 6;
const MARGIN_PX = 8;

/**
 * Lightweight tooltip — wraps any trigger element and shows a styled popup
 * above it after a 600 ms hover delay. Renders via a portal so `overflow:
 * hidden` parents and stacking contexts never clip it.
 *
 * The popup uses the host's design tokens and matches the status-bar tooltip
 * style exactly. Display-only: `pointer-events: none`.
 *
 * The CSS classes (`.silo-tooltip`, `.silo-tooltip-host`) are provided by the
 * host — no stylesheet import is needed in the extension.
 *
 * Pass `disabled` to keep the trigger wrapper mounted (so layout stays stable)
 * while suppressing the popup — handy when the tooltip is only useful
 * conditionally, e.g. showing the full label of a tab only once it's truncated.
 *
 * @example
 * ```tsx
 * <Tooltip content="New File">
 *   <button onClick={createFile}>
 *     <FilePlus size="1.2em" />
 *   </button>
 * </Tooltip>
 * ```
 *
 * @category Core Types
 * @public
 */
export function Tooltip({
  content,
  children,
  disabled = false,
}: {
  /** Text shown in the popup. */
  content: string;
  /** The trigger element the tooltip is anchored to. */
  children: ReactNode;
  /**
   * When `true`, the wrapper still renders (layout is unchanged) but the popup
   * never appears. Defaults to `false`.
   */
  disabled?: boolean;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [anchor, setAnchor] = useState<{ cx: number; top: number } | null>(
    null,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = () => {
    if (disabled) return;
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
      onPointerDown={hide}
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
  const [style, setStyle] = useState<React.CSSProperties>({
    visibility: "hidden",
  });

  useLayoutEffect(() => {
    const el = popupRef.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;

    const left = Math.max(
      MARGIN_PX,
      Math.min(cx - w / 2, window.innerWidth - w - MARGIN_PX),
    );
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

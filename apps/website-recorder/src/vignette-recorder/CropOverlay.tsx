import {
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type { CropRect } from "./presets";
import { clampCrop } from "./presets";
import { clampZoomFocus, type ZoomFocus } from "./zoom-math";

type Props = {
  crop: CropRect;
  onChange: (crop: CropRect) => void;
  disabled?: boolean;
  /** Optional readout inside the crop box (e.g. "719×391px"). */
  sizeLabel?: string;
  /** Zoom focus inside the crop (0–1). Shown when zoom is enabled. */
  zoomFocus?: ZoomFocus | null;
  onChangeZoomFocus?: (focus: ZoomFocus) => void;
  showZoomFocus?: boolean;
};

type DragMode =
  | "move"
  | "n"
  | "s"
  | "e"
  | "w"
  | "ne"
  | "nw"
  | "se"
  | "sw"
  | "focus";

/**
 * Fraction-based crop rectangle over the demo. Pointer events update crop
 * relative to the overlay's offset parent (the demo stage).
 */
export function CropOverlay({
  crop,
  onChange,
  disabled,
  sizeLabel,
  zoomFocus,
  onChangeZoomFocus,
  showZoomFocus,
}: Props) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    mode: DragMode;
    startX: number;
    startY: number;
    origin: CropRect;
    originFocus: ZoomFocus;
  } | null>(null);

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const drag = dragRef.current;
      const box = overlayRef.current?.parentElement?.getBoundingClientRect();
      if (!drag || !box || box.width === 0 || box.height === 0) return;

      if (drag.mode === "focus") {
        const x = (event.clientX - box.left) / box.width;
        const y = (event.clientY - box.top) / box.height;
        // Convert demo fractions → crop-local fractions.
        onChangeZoomFocus?.(
          clampZoomFocus({
            x: (x - crop.x) / Math.max(0.001, crop.w),
            y: (y - crop.y) / Math.max(0.001, crop.h),
          }),
        );
        return;
      }

      const dx = (event.clientX - drag.startX) / box.width;
      const dy = (event.clientY - drag.startY) / box.height;
      const o = drag.origin;
      let next = { ...o };

      if (drag.mode === "move") {
        next = { ...o, x: o.x + dx, y: o.y + dy };
      } else {
        if (drag.mode.includes("e")) {
          next.w = o.w + dx;
        }
        if (drag.mode.includes("w")) {
          next.x = o.x + dx;
          next.w = o.w - dx;
        }
        if (drag.mode.includes("s")) {
          next.h = o.h + dy;
        }
        if (drag.mode.includes("n")) {
          next.y = o.y + dy;
          next.h = o.h - dy;
        }
      }
      onChange(clampCrop(next));
    }

    function onUp() {
      dragRef.current = null;
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [onChange, onChangeZoomFocus, crop.x, crop.y, crop.w, crop.h]);

  function startDrag(mode: DragMode, event: ReactPointerEvent) {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      origin: crop,
      originFocus: zoomFocus ?? { x: 0.5, y: 0.5 },
    };
  }

  const style = {
    left: `${crop.x * 100}%`,
    top: `${crop.y * 100}%`,
    width: `${crop.w * 100}%`,
    height: `${crop.h * 100}%`,
  };

  const focus = zoomFocus ?? { x: 0.5, y: 0.5 };
  const focusStyle = {
    left: `${(crop.x + focus.x * crop.w) * 100}%`,
    top: `${(crop.y + focus.y * crop.h) * 100}%`,
  };

  return (
    <div className="vignette-crop-mask" ref={overlayRef} aria-hidden="true">
      <div
        className="vignette-crop-shade vignette-crop-shade-top"
        style={{ height: `${crop.y * 100}%` }}
      />
      <div
        className="vignette-crop-shade vignette-crop-shade-left"
        style={{
          top: `${crop.y * 100}%`,
          height: `${crop.h * 100}%`,
          width: `${crop.x * 100}%`,
        }}
      />
      <div
        className="vignette-crop-shade vignette-crop-shade-right"
        style={{
          top: `${crop.y * 100}%`,
          height: `${crop.h * 100}%`,
          left: `${(crop.x + crop.w) * 100}%`,
          width: `${(1 - crop.x - crop.w) * 100}%`,
        }}
      />
      <div
        className="vignette-crop-shade vignette-crop-shade-bottom"
        style={{
          top: `${(crop.y + crop.h) * 100}%`,
          height: `${(1 - crop.y - crop.h) * 100}%`,
        }}
      />
      <div
        className={`vignette-crop-rect${disabled ? " is-disabled" : ""}`}
        style={style}
        onPointerDown={(event) => startDrag("move", event)}
      >
        <span className="vignette-crop-label">
          {sizeLabel ??
            `Crop ${Math.round(crop.w * 100)}×${Math.round(crop.h * 100)}%`}
        </span>
        {(
          [
            ["n", "vignette-crop-handle-n"],
            ["s", "vignette-crop-handle-s"],
            ["e", "vignette-crop-handle-e"],
            ["w", "vignette-crop-handle-w"],
            ["ne", "vignette-crop-handle-ne"],
            ["nw", "vignette-crop-handle-nw"],
            ["se", "vignette-crop-handle-se"],
            ["sw", "vignette-crop-handle-sw"],
          ] as const
        ).map(([mode, className]) => (
          <i
            key={mode}
            className={`vignette-crop-handle ${className}`}
            onPointerDown={(event) => startDrag(mode, event)}
          />
        ))}
      </div>
      {showZoomFocus ? (
        <button
          type="button"
          className="vignette-zoom-focus"
          style={focusStyle}
          disabled={disabled}
          aria-label="Zoom focus"
          title="Drag zoom target"
          onPointerDown={(event) => startDrag("focus", event)}
        />
      ) : null}
    </div>
  );
}

import {
  SCRIPT_CURSOR_TOP_Y_PCT,
  type ScriptCursorPlan,
} from "@silo-code/website/demo";
import type { CropRect } from "./presets";

export type CursorTargetPx = { x: number; y: number };

function cropOrigin(
  crop: CropRect,
  fullWidth: number,
  fullHeight: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const sx = Math.round(crop.x * fullWidth);
  const sy = Math.round(crop.y * fullHeight);
  const sw = Math.max(1, Math.round(crop.w * fullWidth));
  const sh = Math.max(1, Math.round(crop.h * fullHeight));
  return {
    sx: Math.min(Math.max(0, sx), Math.max(0, fullWidth - 1)),
    sy: Math.min(Math.max(0, sy), Math.max(0, fullHeight - 1)),
    sw: Math.min(sw, Math.max(1, fullWidth - sx)),
    sh: Math.min(sh, Math.max(1, fullHeight - sy)),
  };
}

/**
 * Center of `el` in the cropped capture canvas's pixel space.
 * `fullWidth`/`fullHeight` are the pre-crop screenshot dimensions (already scaled).
 */
export function elementCenterInCrop(
  root: DOMRectReadOnly,
  el: DOMRectReadOnly,
  crop: CropRect,
  fullWidth: number,
  fullHeight: number,
): CursorTargetPx | null {
  if (root.width <= 0 || root.height <= 0) return null;
  const cxCss = el.left + el.width / 2 - root.left;
  const cyCss = el.top + el.height / 2 - root.top;
  const fullX = (cxCss / root.width) * fullWidth;
  const fullY = (cyCss / root.height) * fullHeight;
  const { sx, sy, sw, sh } = cropOrigin(crop, fullWidth, fullHeight);
  const x = fullX - sx;
  const y = fullY - sy;
  if (x < -40 || y < -40 || x > sw + 40 || y > sh + 40) return null;
  return { x, y };
}

/** Top-of-demo Y in crop pixel space (matches SCRIPT_CURSOR_TOP_Y_PCT). */
export function cursorTopYInCrop(crop: CropRect, fullHeight: number): number {
  const { sy } = cropOrigin(crop, Math.max(1, fullHeight), fullHeight);
  const fullY = (SCRIPT_CURSOR_TOP_Y_PCT / 100) * fullHeight;
  return fullY - sy;
}

export function cursorCompositePosition(
  target: CursorTargetPx,
  from: CursorTargetPx,
  travelProgress: number,
): CursorTargetPx {
  const p = Math.min(1, Math.max(0, travelProgress));
  return {
    x: from.x + (target.x - from.x) * p,
    y: from.y + (target.y - from.y) * p,
  };
}

/** Suggested MediaRecorder bitrate for a crisp WebM at the given size/fps. */
export function suggestedVideoBitsPerSecond(
  width: number,
  height: number,
  fps: number,
): number {
  // ~0.25 bits per pixel per frame, floored at 8 Mbps for homepage clips.
  const estimate = Math.round(width * height * fps * 0.25);
  return Math.min(40_000_000, Math.max(8_000_000, estimate));
}

/** Draw the demo script cursor (matches `.demo-script-pointer` silhouette). */
export function drawScriptCursor(
  ctx: CanvasRenderingContext2D,
  pos: CursorTargetPx,
  plan: Pick<ScriptCursorPlan, "clicking">,
  pixelRatio: number,
): void {
  const size = 20 * pixelRatio;
  const press = plan.clicking ? 0.86 : 1;
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.scale(press, press);
  ctx.translate(-2 * pixelRatio, -2 * pixelRatio);

  const scale = size / 24;
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.moveTo(4, 2);
  ctx.lineTo(4, 18);
  ctx.lineTo(8.5, 14.5);
  ctx.lineTo(11.5, 21);
  ctx.lineTo(14, 20);
  ctx.lineTo(11, 13.5);
  ctx.lineTo(17, 13.5);
  ctx.closePath();
  ctx.fillStyle = "#f2f4ea";
  ctx.strokeStyle = "#11121a";
  ctx.lineWidth = 1.2;
  ctx.lineJoin = "round";
  ctx.fill();
  ctx.stroke();

  if (plan.clicking) {
    ctx.beginPath();
    ctx.arc(8, 8, 5, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(94, 184, 158, 0.85)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  ctx.restore();
}

import type { CropRect } from "./presets";
import { clampCrop } from "./presets";

export type PixelRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/** Map a fractional crop onto a demo box size (CSS pixels). */
export function cropToPixels(
  crop: CropRect,
  demoWidth: number,
  demoHeight: number,
): PixelRect {
  return {
    x: Math.round(crop.x * demoWidth),
    y: Math.round(crop.y * demoHeight),
    w: Math.max(1, Math.round(crop.w * demoWidth)),
    h: Math.max(1, Math.round(crop.h * demoHeight)),
  };
}

/** Map a pixel crop back to fractions of the demo box. */
export function pixelsToCrop(
  pixels: PixelRect,
  demoWidth: number,
  demoHeight: number,
): CropRect {
  if (demoWidth <= 0 || demoHeight <= 0) {
    return clampCrop({ x: 0, y: 0, w: 1, h: 1 });
  }
  return clampCrop({
    x: pixels.x / demoWidth,
    y: pixels.y / demoHeight,
    w: pixels.w / demoWidth,
    h: pixels.h / demoHeight,
  });
}

/**
 * Keep the current crop origin; set width/height to an exact pixel size
 * (clamped into the demo). Used to match homepage slot dimensions.
 */
export function cropWithPixelSize(
  crop: CropRect,
  widthPx: number,
  heightPx: number,
  demoWidth: number,
  demoHeight: number,
): CropRect {
  if (demoWidth <= 0 || demoHeight <= 0) return crop;
  const origin = cropToPixels(crop, demoWidth, demoHeight);
  return pixelsToCrop(
    {
      x: origin.x,
      y: origin.y,
      w: Math.max(1, Math.round(widthPx)),
      h: Math.max(1, Math.round(heightPx)),
    },
    demoWidth,
    demoHeight,
  );
}

/** Spatial focus inside the recorded crop (0–1). */
export type ZoomFocus = { x: number; y: number };

/** Easing for a zoom ramp (`none` = linear). */
export type ZoomEase = "none" | "in" | "out" | "in-out";

/** One scale ramp on the timeline (zoom in or out). */
export type ZoomSegment = {
  id: string;
  /** Absolute script time when the ramp begins (ms). */
  startMs: number;
  /** Absolute script time when the ramp reaches `scale` (ms). */
  endMs: number;
  /** Absolute end scale (1 = full crop / zoomed out). */
  scale: number;
  focus: ZoomFocus;
  /** How the ramp interpolates from the previous scale. Defaults to in-out. */
  ease?: ZoomEase;
};

/** @deprecated Prefer ZoomSegment[]; kept for localStorage migration. */
export type ZoomSettings = {
  atMs: number;
  endMs: number;
  endScale: number;
  focus: ZoomFocus;
};

/** Minimum zoom ramp length so start/end stay distinguishable. */
export const MIN_ZOOM_SPAN_MS = 200;

export function clampZoomFocus(focus: ZoomFocus): ZoomFocus {
  return {
    x: Math.min(1, Math.max(0, focus.x)),
    y: Math.min(1, Math.max(0, focus.y)),
  };
}

export function clampZoomScale(scale: number): number {
  return Math.min(4, Math.max(1, scale));
}

/**
 * Clamp zoom start inside the timeline, leaving room for a minimum span
 * before the timeline end (or before an existing end marker).
 * Not limited to In→Out — ramps may start before In (pre-zoom) or after Out.
 */
export function clampZoomAtMs(
  atMs: number,
  rangeStartMs: number,
  rangeEndMs: number,
  zoomEndMs?: number,
): number {
  const lo = rangeStartMs;
  const hiCap =
    zoomEndMs != null
      ? zoomEndMs - MIN_ZOOM_SPAN_MS
      : rangeEndMs - MIN_ZOOM_SPAN_MS;
  const hi = Math.max(lo, hiCap);
  return Math.min(hi, Math.max(lo, atMs));
}

/**
 * Clamp zoom end inside the timeline, after start + minimum span.
 */
export function clampZoomEndMs(
  endMs: number,
  rangeStartMs: number,
  rangeEndMs: number,
  zoomAtMs: number,
): number {
  const lo = Math.min(rangeEndMs, zoomAtMs + MIN_ZOOM_SPAN_MS);
  const hi = rangeEndMs;
  return Math.min(hi, Math.max(lo, Math.max(rangeStartMs, endMs)));
}

/** Keep a start/end pair valid inside a timeline window (usually 0…duration). */
export function clampZoomWindow(
  atMs: number,
  endMs: number,
  rangeStartMs: number,
  rangeEndMs: number,
): { atMs: number; endMs: number } {
  const start = clampZoomAtMs(atMs, rangeStartMs, rangeEndMs);
  const end = clampZoomEndMs(endMs, rangeStartMs, rangeEndMs, start);
  return {
    atMs: clampZoomAtMs(start, rangeStartMs, rangeEndMs, end),
    endMs: end,
  };
}

/** Clamp one segment's window inside a timeline window (no neighbor awareness). */
export function clampZoomSegmentWindow(
  segment: Pick<ZoomSegment, "startMs" | "endMs">,
  rangeStartMs: number,
  rangeEndMs: number,
): { startMs: number; endMs: number } {
  const window = clampZoomWindow(
    segment.startMs,
    segment.endMs,
    rangeStartMs,
    rangeEndMs,
  );
  return { startMs: window.atMs, endMs: window.endMs };
}

/**
 * Clamp a segment so it stays inside the timeline window and does not overlap
 * neighbors (sorted by start). Callers pass 0…durationMs so zooms may sit
 * outside In→Out (pre-zoom before In, hold after Out).
 */
export function clampZoomSegmentAmong(
  segment: ZoomSegment,
  others: ZoomSegment[],
  rangeStartMs: number,
  rangeEndMs: number,
): ZoomSegment {
  const sortedOthers = [...others]
    .filter((item) => item.id !== segment.id)
    .sort((a, b) => a.startMs - b.startMs);

  let lo = rangeStartMs;
  let hi = rangeEndMs;
  for (const other of sortedOthers) {
    if (other.endMs <= segment.startMs + 1) {
      lo = Math.max(lo, other.endMs);
    } else if (other.startMs >= segment.endMs - 1) {
      hi = Math.min(hi, other.startMs);
    } else {
      // Overlaps — push this segment after the other if its midpoint is later.
      const mid = (segment.startMs + segment.endMs) / 2;
      const otherMid = (other.startMs + other.endMs) / 2;
      if (mid >= otherMid) lo = Math.max(lo, other.endMs);
      else hi = Math.min(hi, other.startMs);
    }
  }

  if (hi - lo < MIN_ZOOM_SPAN_MS) {
    // No room — keep previous clamped window inside the full range.
    const fallback = clampZoomSegmentWindow(segment, rangeStartMs, rangeEndMs);
    return {
      ...segment,
      startMs: fallback.startMs,
      endMs: fallback.endMs,
      scale: clampZoomScale(segment.scale),
      focus: clampZoomFocus(segment.focus),
    };
  }

  const window = clampZoomSegmentWindow(segment, lo, hi);
  return {
    ...segment,
    startMs: window.startMs,
    endMs: window.endMs,
    scale: clampZoomScale(segment.scale),
    focus: clampZoomFocus(segment.focus),
    ease: normalizeZoomEase(segment.ease),
  };
}

export function normalizeZoomEase(ease: ZoomEase | undefined): ZoomEase {
  if (ease === "none" || ease === "in" || ease === "out" || ease === "in-out") {
    return ease;
  }
  return "in-out";
}

export function easeInCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * x;
}

export function easeOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return 1 - Math.pow(1 - x, 3);
}

/** Smoothstep-ish ease for a gentle push-in / pull-out. */
export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function applyZoomEase(t: number, ease: ZoomEase = "in-out"): number {
  const x = Math.min(1, Math.max(0, t));
  switch (normalizeZoomEase(ease)) {
    case "none":
      return x;
    case "in":
      return easeInCubic(x);
    case "out":
      return easeOutCubic(x);
    case "in-out":
      return easeInOutCubic(x);
  }
}

/**
 * 0 before zoom start, 1 at (and after) zoom end.
 * @deprecated Prefer zoomStateAt with ZoomSegment[].
 */
export function zoomProgress(options: {
  absoluteMs?: number;
  localElapsedMs?: number;
  rangeStartMs?: number;
  zoomAtMs: number;
  zoomEndMs: number;
}): number {
  const absolute =
    options.absoluteMs ??
    (options.rangeStartMs ?? 0) + (options.localElapsedMs ?? 0);
  if (absolute <= options.zoomAtMs) return 0;
  const span = Math.max(1, options.zoomEndMs - options.zoomAtMs);
  return easeInOutCubic((absolute - options.zoomAtMs) / span);
}

/** Interpolated scale between two absolute scales. */
export function lerpZoomScale(
  fromScale: number,
  toScale: number,
  progress: number,
): number {
  const p = Math.min(1, Math.max(0, progress));
  return (
    clampZoomScale(fromScale) +
    (clampZoomScale(toScale) - clampZoomScale(fromScale)) * p
  );
}

/** @deprecated Prefer lerpZoomScale / zoomStateAt. */
export function zoomScaleAtProgress(
  endScale: number,
  progress: number,
): number {
  return lerpZoomScale(1, endScale, progress);
}

export type ZoomState = {
  scale: number;
  focus: ZoomFocus;
};

const DEFAULT_FOCUS: ZoomFocus = { x: 0.5, y: 0.55 };

/**
 * Absolute scale + focus at an absolute timeline time, walking ordered ramps.
 * Holds the previous scale between segments; scale 1 before the first.
 *
 * During a ramp only scale is interpolated. Focus stays pinned so the camera
 * pushes straight into (or pulls out from) one point — lerping focus with
 * scale pans while zooming and reads as a curved “bend.”
 */
export function zoomStateAt(
  segments: ZoomSegment[],
  absoluteMs: number,
): ZoomState {
  const sorted = [...segments].sort((a, b) => a.startMs - b.startMs);
  let scale = 1;
  let focus = DEFAULT_FOCUS;

  for (const segment of sorted) {
    const toScale = clampZoomScale(segment.scale);
    const toFocus = clampZoomFocus(segment.focus);
    if (absoluteMs < segment.startMs) {
      return { scale, focus };
    }
    if (absoluteMs < segment.endMs) {
      const span = Math.max(1, segment.endMs - segment.startMs);
      const progress = applyZoomEase(
        (absoluteMs - segment.startMs) / span,
        segment.ease,
      );
      // Zoom in → pin destination focus; zoom out → keep current focus.
      const rampFocus = toScale >= scale ? toFocus : focus;
      return {
        scale: lerpZoomScale(scale, toScale, progress),
        focus: rampFocus,
      };
    }
    scale = toScale;
    focus = toFocus;
  }

  return { scale, focus };
}

/**
 * Digitally zoom `source` (full crop frame) toward `focus` by absolute `scale`.
 * Output canvas matches source dimensions.
 */
export function applyZoomToFrame(
  source: HTMLCanvasElement,
  options: {
    scale: number;
    focus: ZoomFocus;
    /** @deprecated Ignored — pass absolute `scale`. */
    progress?: number;
    /** @deprecated Ignored — pass absolute `scale`. */
    endScale?: number;
  },
): HTMLCanvasElement {
  const scale =
    options.progress != null && options.endScale != null
      ? zoomScaleAtProgress(options.endScale, options.progress)
      : clampZoomScale(options.scale);

  if (scale <= 1.001) {
    const copy = document.createElement("canvas");
    copy.width = source.width;
    copy.height = source.height;
    copy.getContext("2d")?.drawImage(source, 0, 0);
    return copy;
  }

  const focus = clampZoomFocus(options.focus);
  const vw = source.width / scale;
  const vh = source.height / scale;
  let sx = focus.x * source.width - vw / 2;
  let sy = focus.y * source.height - vh / 2;
  sx = Math.min(Math.max(0, sx), Math.max(0, source.width - vw));
  sy = Math.min(Math.max(0, sy), Math.max(0, source.height - vh));

  const out = document.createElement("canvas");
  out.width = source.width;
  out.height = source.height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sx, sy, vw, vh, 0, 0, out.width, out.height);
  return out;
}

export function newZoomSegmentId(): string {
  return `z-${Math.random().toString(36).slice(2, 10)}`;
}

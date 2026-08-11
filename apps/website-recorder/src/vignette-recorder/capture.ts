import { domToCanvas } from "modern-screenshot";
import type { DemoScriptStep } from "@silo-code/website/demo";
import { isDemoScriptClickStep } from "@silo-code/website/demo";
import { planScriptSeek } from "@silo-code/website/demo";
import type { CropRect } from "./presets";
import {
  cursorCompositePosition,
  cursorTopYInCrop,
  drawScriptCursor,
  elementCenterInCrop,
  suggestedVideoBitsPerSecond,
  type CursorTargetPx,
} from "./cursor-composite";
import { applyZoomToFrame, zoomStateAt, type ZoomSegment } from "./zoom-math";

export type RecordedVignette = {
  webmBlob: Blob;
  posterBlob: Blob;
  width: number;
  height: number;
  frameCount: number;
};

/** Soft bookend so `<video loop>` wraps softly instead of a hard cut. */
export const DEFAULT_LOOP_FADE_MS = 300;

/** Peak Gaussian blur (CSS px) at the bookend extremes. */
export const DEFAULT_LOOP_BLUR_PX = 28;

/** Matches `.home-story-visual-video` so a fade dip blends with the homepage frame. */
export const LOOP_FADE_COLOR = "#0f1115";

export type LoopBookendMode = "none" | "fade" | "dim" | "blur";

export function normalizeLoopBookendMode(
  mode: LoopBookendMode | string | undefined,
): LoopBookendMode {
  if (mode === "none" || mode === "fade" || mode === "dim" || mode === "blur") {
    return mode;
  }
  return "fade";
}

/** How dark a `"dim"` bookend gets at the ends (0 = none, 1 = full black). */
export const DEFAULT_LOOP_DIM_AMOUNT = 0.55;

/**
 * Content opacity for a fade bookend: 0 at the ends, 1 mid-clip.
 */
export function loopBookendOpacity(
  tMs: number,
  durationMs: number,
  fadeMs: number,
): number {
  if (fadeMs <= 0 || durationMs <= 0) return 1;
  const fade = Math.min(fadeMs, durationMs / 2);
  if (fade <= 0) return 1;
  if (tMs <= 0) return 0;
  if (tMs >= durationMs) return 0;
  if (tMs < fade) return tMs / fade;
  if (tMs > durationMs - fade) return (durationMs - tMs) / fade;
  return 1;
}

/** 0 mid-clip (sharp), 1 at the ends (full bookend). */
export function loopBookendStrength(
  tMs: number,
  durationMs: number,
  fadeMs: number,
): number {
  return 1 - loopBookendOpacity(tMs, durationMs, fadeMs);
}

export function loopBookendBlurPx(
  strength: number,
  maxBlurPx: number = DEFAULT_LOOP_BLUR_PX,
): number {
  const s = Math.min(1, Math.max(0, strength));
  return s * Math.max(0, maxBlurPx);
}

/** Draw `frame` onto `ctx`, optionally dipping through `LOOP_FADE_COLOR`. */
export function drawFrameWithLoopFade(
  ctx: CanvasRenderingContext2D,
  frame: CanvasImageSource,
  width: number,
  height: number,
  opacity: number,
  fadeColor: string = LOOP_FADE_COLOR,
): void {
  const visible = Math.min(1, Math.max(0, opacity));
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = fadeColor;
  ctx.fillRect(0, 0, width, height);
  if (visible > 0) {
    ctx.globalAlpha = visible;
    ctx.drawImage(frame, 0, 0, width, height);
  }
  ctx.restore();
}

/** Draw one encode frame with fade, dim, or blur bookends. */
export function drawFrameWithLoopBookend(
  ctx: CanvasRenderingContext2D,
  frame: CanvasImageSource,
  width: number,
  height: number,
  options: {
    mode: LoopBookendMode;
    /** 0 = mid-clip, 1 = ends. */
    strength: number;
    fadeColor?: string;
    maxBlurPx?: number;
    /** Peak darkening for `"dim"` (0–1). */
    dimAmount?: number;
  },
): void {
  const mode = normalizeLoopBookendMode(options.mode);
  const strength = Math.min(1, Math.max(0, options.strength));
  if (mode === "none" || strength <= 0.001) {
    ctx.drawImage(frame, 0, 0, width, height);
    return;
  }
  if (mode === "fade") {
    drawFrameWithLoopFade(
      ctx,
      frame,
      width,
      height,
      1 - strength,
      options.fadeColor,
    );
    return;
  }
  if (mode === "dim") {
    const amount = Math.min(
      1,
      Math.max(0, options.dimAmount ?? DEFAULT_LOOP_DIM_AMOUNT),
    );
    ctx.drawImage(frame, 0, 0, width, height);
    const alpha = strength * amount;
    if (alpha > 0.001) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = options.fadeColor ?? LOOP_FADE_COLOR;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
    return;
  }

  const blurPx = loopBookendBlurPx(strength, options.maxBlurPx);
  ctx.save();
  if (blurPx > 0.05) {
    ctx.filter = `blur(${blurPx.toFixed(2)}px)`;
  }
  ctx.drawImage(frame, 0, 0, width, height);
  ctx.restore();
}

/** Pixel rect inside a source bitmap for a fractional crop (pure / testable). */
export function cropSourceRect(
  sourceWidth: number,
  sourceHeight: number,
  crop: CropRect,
): { sx: number; sy: number; sw: number; sh: number } {
  const sx = Math.round(crop.x * sourceWidth);
  const sy = Math.round(crop.y * sourceHeight);
  const sw = Math.max(1, Math.round(crop.w * sourceWidth));
  const sh = Math.max(1, Math.round(crop.h * sourceHeight));
  return {
    sx: Math.min(Math.max(0, sx), Math.max(0, sourceWidth - 1)),
    sy: Math.min(Math.max(0, sy), Math.max(0, sourceHeight - 1)),
    sw: Math.min(sw, Math.max(1, sourceWidth - sx)),
    sh: Math.min(sh, Math.max(1, sourceHeight - sy)),
  };
}

function cropCanvas(
  source: HTMLCanvasElement,
  crop: CropRect,
): HTMLCanvasElement {
  const { sx, sy, sw, sh } = cropSourceRect(source.width, source.height, crop);
  const out = document.createElement("canvas");
  out.width = sw;
  out.height = sh;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, sw, sh);
  return out;
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("poster failed"))),
      "image/png",
    );
  });
}

function pickMimeType(): string {
  const candidates = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const type of candidates) {
    if (
      typeof MediaRecorder !== "undefined" &&
      MediaRecorder.isTypeSupported(type)
    ) {
      return type;
    }
  }
  return "video/webm";
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException("Aborted", "AbortError");
  }
}

/** Abortable delay. */
export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const id = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      reject(new DOMException("Aborted", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function raceAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal | undefined,
  timeoutMs: number,
  label: string,
): Promise<T> {
  assertNotAborted(signal);

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let abortHandler: (() => void) | undefined;

  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  const aborted =
    signal == null
      ? null
      : new Promise<never>((_, reject) => {
          abortHandler = () =>
            reject(new DOMException("Aborted", "AbortError"));
          signal.addEventListener("abort", abortHandler, { once: true });
        });

  try {
    if (aborted) return await Promise.race([promise, timeout, aborted]);
    return await Promise.race([promise, timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    if (signal && abortHandler) {
      signal.removeEventListener("abort", abortHandler);
    }
  }
}

function screenshotFilter(element: Node): boolean {
  if (!(element instanceof Element)) return true;
  const tag = element.tagName;
  // Still skip raw iframes — we paint same-origin snapshots as placeholders
  // first (see withIframePlaceholders). Nested capture of iframes is slow/flaky.
  if (tag === "IFRAME" || tag === "VIDEO" || tag === "OBJECT") return false;
  // Cursor is composited smoothly on encode (live DOM cursor is only ~12fps).
  if (element.classList.contains("demo-script-cursor")) return false;
  return true;
}

/** Capture scale — 2× keeps homepage clips sharp when shown at CSS size. */
export function capturePixelRatio(): number {
  return 2;
}

/**
 * Replace same-origin iframes (Ink web preview) with `<img>` snapshots so the
 * main `domToCanvas` pass includes that region. Returns a restore function.
 * `cache` reuses data-URLs across frames — the preview is static scenery.
 */
async function withIframePlaceholders(
  root: HTMLElement,
  signal: AbortSignal | undefined,
  cache: Map<string, string>,
): Promise<() => void> {
  const cleanups: Array<() => void> = [];
  const iframes = Array.from(root.querySelectorAll("iframe"));

  for (const iframe of iframes) {
    assertNotAborted(signal);
    const doc = iframe.contentDocument;
    if (!doc?.documentElement) continue;

    const cacheKey =
      iframe.getAttribute("srcdoc")?.slice(0, 120) ??
      iframe.src ??
      String(iframes.indexOf(iframe));

    let dataUrl = cache.get(cacheKey);
    if (!dataUrl) {
      try {
        const shot = await raceAbort(
          domToCanvas(doc.documentElement, {
            scale: 1,
            backgroundColor: "#ffffff",
          }),
          signal,
          8_000,
          "Iframe snapshot",
        );
        dataUrl = shot.toDataURL("image/png");
        cache.set(cacheKey, dataUrl);
      } catch {
        continue;
      }
    }

    const parent = iframe.parentElement;
    if (!parent) continue;
    const parentPos = getComputedStyle(parent).position;
    if (parentPos === "static") {
      parent.style.position = "relative";
      cleanups.push(() => {
        parent.style.position = parentPos;
      });
    }

    const iframeRect = iframe.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    const placeholder = document.createElement("img");
    placeholder.src = dataUrl;
    placeholder.alt = "";
    placeholder.setAttribute("data-vignette-iframe-placeholder", "1");
    Object.assign(placeholder.style, {
      position: "absolute",
      left: `${iframeRect.left - parentRect.left}px`,
      top: `${iframeRect.top - parentRect.top}px`,
      width: `${iframeRect.width}px`,
      height: `${iframeRect.height}px`,
      objectFit: "fill",
      margin: "0",
      padding: "0",
      border: "0",
      zIndex: "5",
      pointerEvents: "none",
    });

    const prevVisibility = iframe.style.visibility;
    iframe.style.visibility = "hidden";
    parent.appendChild(placeholder);
    cleanups.push(() => {
      placeholder.remove();
      iframe.style.visibility = prevVisibility;
    });
  }

  return () => {
    for (const cleanup of cleanups.reverse()) cleanup();
  };
}

async function grabCroppedFrame(
  root: HTMLElement,
  crop: CropRect,
  signal: AbortSignal | undefined,
  iframeCache: Map<string, string>,
  pixelRatio: number,
): Promise<{
  cropped: HTMLCanvasElement;
  fullWidth: number;
  fullHeight: number;
}> {
  const restore = await withIframePlaceholders(root, signal, iframeCache);
  try {
    const full = await raceAbort(
      domToCanvas(root, {
        scale: pixelRatio,
        backgroundColor: "#0f1115",
        filter: screenshotFilter,
      }),
      signal,
      12_000,
      "Frame capture",
    );
    return {
      cropped: cropCanvas(full, crop),
      fullWidth: full.width,
      fullHeight: full.height,
    };
  } finally {
    restore();
  }
}

type TimedFrame = {
  canvas: HTMLCanvasElement;
  /** Elapsed ms since capture start (In). */
  t: number;
};

function pickFrameAt(frames: TimedFrame[], t: number): HTMLCanvasElement {
  let best = frames[0];
  let bestDist = Math.abs(best.t - t);
  for (let i = 1; i < frames.length; i++) {
    const dist = Math.abs(frames[i].t - t);
    if (dist < bestDist) {
      best = frames[i];
      bestDist = dist;
    }
  }
  return best.canvas;
}

/**
 * Capture cropped frames from `[data-vignette-root]` for `durationMs` of
 * **wall-clock** time while the live demo/script keeps playing, then encode
 * a muted WebM at `fps`.
 *
 * DOM grabs always yield to the event loop so script timers (toast, clicks)
 * stay in sync with the timeline — even when FPS is high. Live sampling is
 * capped (~12fps); zoom + cursor are applied on encode at the output fps so
 * motion stays smooth without starving the demo.
 */
export async function recordVignetteFrames(options: {
  crop: CropRect;
  fps?: number;
  durationMs: number;
  signal?: AbortSignal;
  onFrame?: (index: number, total: number, phase: "capture" | "encode") => void;
  onClock?: (elapsedMs: number) => void;
  /** Absolute script time at In — used with `script` for encode-time cursor. */
  rangeStartMs?: number;
  /** Demo script — when set, cursor is composited smoothly on encode. */
  script?: DemoScriptStep[];
  /** Scale ramps applied on encode (absolute timeline). */
  zoomSegments?: ZoomSegment[];
  /**
   * Soft wrap for looping homepage videos. Defaults to fade.
   * Use `mode: "none"` or `durationMs: 0` to disable.
   */
  loopBookendMode?: LoopBookendMode;
  /** Length of each bookend in ms. Defaults to {@link DEFAULT_LOOP_FADE_MS}. */
  loopFadeMs?: number;
  /** Peak blur radius when mode is `"blur"`. */
  loopBlurPx?: number;
  /** Peak darkening when mode is `"dim"` (0–1). */
  loopDimAmount?: number;
}): Promise<RecordedVignette> {
  const root = document.querySelector<HTMLElement>("[data-vignette-root]");
  if (!root) throw new Error("No [data-vignette-root] demo in the page");

  const outputFps = Math.max(1, options.fps ?? 30);
  const outputInterval = 1000 / outputFps;
  const durationMs = Math.max(200, options.durationMs);
  const loopBookendMode = normalizeLoopBookendMode(options.loopBookendMode);
  const loopFadeMs =
    loopBookendMode === "none"
      ? 0
      : options.loopFadeMs === undefined
        ? DEFAULT_LOOP_FADE_MS
        : Math.max(0, options.loopFadeMs);
  const loopBlurPx =
    options.loopBlurPx === undefined
      ? DEFAULT_LOOP_BLUR_PX
      : Math.max(0, options.loopBlurPx);
  const loopDimAmount =
    options.loopDimAmount === undefined
      ? DEFAULT_LOOP_DIM_AMOUNT
      : Math.min(1, Math.max(0, options.loopDimAmount));
  const pixelRatio = capturePixelRatio();
  const rangeStartMs = options.rangeStartMs ?? 0;
  const script = options.script ?? [];
  const zoomSegments = options.zoomSegments ?? [];
  const cursorSelectors = script
    .filter(isDemoScriptClickStep)
    .map((step) => step.selector);

  // Cap live DOM sampling — higher rates just block script timers. Output
  // fps (esp. for smooth zoom/cursor) is applied during encode.
  const captureFps = Math.min(outputFps, 12);
  const captureInterval = 1000 / captureFps;
  const estimatedCapture = Math.max(
    1,
    Math.round(durationMs / captureInterval),
  );
  const outputFrameCount = Math.max(1, Math.round(durationMs / outputInterval));

  const frames: TimedFrame[] = [];
  const cursorTargets = new Map<string, CursorTargetPx>();
  let fullHeight = 0;
  const iframeCache = new Map<string, string>();
  const captureStart = performance.now();
  let frameIndex = 0;
  let nextAt = captureStart;
  let capturing = true;

  // Keep the playhead smooth for the live demo (toast / click timing) even
  // though DOM screenshots only land ~12 times a second.
  const clockPromise = (async () => {
    while (capturing) {
      if (options.signal?.aborted) break;
      options.onClock?.(Math.min(durationMs, performance.now() - captureStart));
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
    }
  })();

  try {
    while (performance.now() - captureStart < durationMs) {
      assertNotAborted(options.signal);
      const now = performance.now();
      if (now < nextAt) {
        await wait(nextAt - now, options.signal);
      }
      if (performance.now() - captureStart >= durationMs) break;

      const liveRoot =
        document.querySelector<HTMLElement>("[data-vignette-root]") ?? root;
      const grabbed = await grabCroppedFrame(
        liveRoot,
        options.crop,
        options.signal,
        iframeCache,
        pixelRatio,
      );
      fullHeight = grabbed.fullHeight;

      const rootRect = liveRoot.getBoundingClientRect();
      for (const selector of cursorSelectors) {
        const el = liveRoot.querySelector<HTMLElement>(selector);
        if (!el) continue;
        const center = elementCenterInCrop(
          rootRect,
          el.getBoundingClientRect(),
          options.crop,
          grabbed.fullWidth,
          grabbed.fullHeight,
        );
        if (center) cursorTargets.set(selector, center);
      }

      // Yield so DemoWorkspace setTimeouts (toast show/hide) can fire on time.
      await wait(0, options.signal);

      const elapsed = performance.now() - captureStart;
      frames.push({ canvas: grabbed.cropped, t: elapsed });
      frameIndex += 1;
      nextAt = captureStart + frameIndex * captureInterval;
      options.onFrame?.(frameIndex - 1, estimatedCapture, "capture");
    }
  } finally {
    capturing = false;
    await clockPromise.catch(() => undefined);
  }

  if (frames.length === 0) {
    throw new Error("No frames captured — try a longer in/out range");
  }

  const width = frames[0].canvas.width;
  const height = frames[0].canvas.height;
  const topY = cursorTopYInCrop(
    options.crop,
    fullHeight || height / Math.max(0.01, options.crop.h),
  );

  function frameAtOutputTime(t: number): HTMLCanvasElement {
    const source = pickFrameAt(frames, t);
    let out = source;

    if (script.length > 0 && cursorTargets.size > 0) {
      const plan = planScriptSeek(script, rangeStartMs + t);
      if (plan.cursor) {
        const target = cursorTargets.get(plan.cursor.selector);
        if (target) {
          const from = plan.cursor.fromSelector
            ? cursorTargets.get(plan.cursor.fromSelector)
            : undefined;
          const origin = from ?? { x: target.x, y: topY };
          const pos = cursorCompositePosition(
            target,
            origin,
            plan.cursor.travelProgress,
          );
          const composed = document.createElement("canvas");
          composed.width = source.width;
          composed.height = source.height;
          const cctx = composed.getContext("2d");
          if (cctx) {
            cctx.imageSmoothingEnabled = true;
            cctx.imageSmoothingQuality = "high";
            cctx.drawImage(source, 0, 0);
            drawScriptCursor(cctx, pos, plan.cursor, pixelRatio);
            out = composed;
          }
        }
      }
    }

    // Zoom after cursor so the pointer rides with the push-in / pull-out.
    if (zoomSegments.length > 0) {
      const state = zoomStateAt(zoomSegments, rangeStartMs + t);
      if (state.scale > 1.001) {
        out = applyZoomToFrame(out, {
          scale: state.scale,
          focus: state.focus,
        });
      }
    }

    return out;
  }

  const posterT = Math.min(durationMs, Math.max(0, durationMs * 0.28));
  const posterBlob = await canvasToPngBlob(frameAtOutputTime(posterT));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  drawFrameWithLoopBookend(ctx, frameAtOutputTime(0), width, height, {
    mode: loopBookendMode,
    strength: loopBookendStrength(0, durationMs, loopFadeMs),
    maxBlurPx: loopBlurPx,
    dimAmount: loopDimAmount,
  });

  const stream = canvas.captureStream(0);
  const mimeType = pickMimeType();
  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: suggestedVideoBitsPerSecond(width, height, outputFps),
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = () => reject(new Error("MediaRecorder failed"));
  });
  recorder.start(Math.max(40, Math.round(outputInterval)));

  const encodeStart = performance.now();
  const track = stream.getVideoTracks()[0] as
    | (MediaStreamTrack & { requestFrame?: () => void })
    | undefined;

  for (let i = 0; i < outputFrameCount; i++) {
    assertNotAborted(options.signal);
    const t =
      outputFrameCount === 1 ? 0 : (i / (outputFrameCount - 1)) * durationMs;
    ctx.clearRect(0, 0, width, height);
    drawFrameWithLoopBookend(ctx, frameAtOutputTime(t), width, height, {
      mode: loopBookendMode,
      strength: loopBookendStrength(t, durationMs, loopFadeMs),
      maxBlurPx: loopBlurPx,
      dimAmount: loopDimAmount,
    });
    track?.requestFrame?.();
    options.onFrame?.(i, outputFrameCount, "encode");
    const targetTime = encodeStart + (i + 1) * outputInterval;
    const delay = targetTime - performance.now();
    if (delay > 0) await wait(delay, options.signal);
  }

  recorder.requestData();
  recorder.stop();
  stream.getTracks().forEach((mediaTrack) => mediaTrack.stop());
  await Promise.race([
    stopped,
    wait(5_000).then(() => {
      throw new Error("MediaRecorder stop timed out");
    }),
  ]);

  const webmBlob = new Blob(chunks, { type: mimeType });
  if (webmBlob.size === 0) {
    throw new Error("Recording produced an empty WebM");
  }
  return {
    webmBlob,
    posterBlob,
    width,
    height,
    frameCount: outputFrameCount,
  };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

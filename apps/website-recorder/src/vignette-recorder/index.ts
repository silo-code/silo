/** Public surface for the vignette recorder (homepage + future docs reuse). */

export { VignetteRecorder } from "./VignetteRecorder";
export { CropOverlay } from "./CropOverlay";
export { ScriptTimeline } from "./ScriptTimeline";
export {
  recordVignetteFrames,
  downloadBlob,
  wait,
  cropSourceRect,
  loopBookendOpacity,
  loopBookendStrength,
  loopBookendBlurPx,
  drawFrameWithLoopFade,
  drawFrameWithLoopBookend,
  normalizeLoopBookendMode,
  DEFAULT_LOOP_FADE_MS,
  DEFAULT_LOOP_BLUR_PX,
  DEFAULT_LOOP_DIM_AMOUNT,
  LOOP_FADE_COLOR,
  type LoopBookendMode,
  type RecordedVignette,
} from "./capture";
export {
  cropToPixels,
  pixelsToCrop,
  cropWithPixelSize,
  type PixelRect,
} from "./crop-math";
export {
  scriptDurationMs,
  clampTimelineRange,
  formatTimelineTime,
  planScriptSeek,
  type TimelineRange,
  type ScriptSeekPlan,
} from "./timeline-math";
export {
  applyZoomToFrame,
  zoomProgress,
  zoomScaleAtProgress,
  zoomStateAt,
  applyZoomEase,
  normalizeZoomEase,
  clampZoomAtMs,
  clampZoomEndMs,
  clampZoomWindow,
  clampZoomScale,
  clampZoomSegmentAmong,
  type ZoomFocus,
  type ZoomEase,
  type ZoomSegment,
  type ZoomSettings,
  type ZoomState,
} from "./zoom-math";
export {
  VIGNETTE_PRESETS,
  clampCrop,
  loadStoredCrop,
  storeCrop,
  timelineDurationMs,
  presetScript,
  type CropRect,
  type VignettePreset,
} from "./presets";
export {
  createProject,
  parseProjectFile,
  serializeProjectFile,
  ensureProjectLibrary,
  slugifyFilename,
  type VignetteProject,
  type ProjectPresetSeed,
} from "./project-file";

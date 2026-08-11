import type { DemoScriptStep } from "@silo-code/website/demo";
import type { DemoScene } from "@silo-code/website/demo";
import {
  extensionTodosScene,
  heroScene,
  navigatorScene,
  terminalsFirstScene,
  sceneScript,
  worktreeToastScene,
} from "@silo-code/website/demo";
import { scriptDurationMs } from "@silo-code/website/demo";

/** Crop as fractions of the demo-wrap box (0–1). */
export type CropRect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

/**
 * A recorder-facing wrap around a {@link DemoScene}: which script to run,
 * crop/range defaults, and suggested WebM filename. Layout and workspace
 * catalog always come from the scene.
 */
export type VignettePreset = {
  id: string;
  label: string;
  scene: DemoScene;
  /** Key in `scene.scripts`. Defaults to `scene.defaultScript`. */
  scriptKey?: string;
  hideScriptCursor: boolean;
  defaultCrop: CropRect;
  /** Optional default In→Out window (ms). Falls back to 0…min(duration, 4500). */
  defaultRangeMs?: { startMs: number; endMs: number };
  /**
   * Extra ms after the script ends so the timeline (and In→Out) can extend
   * past the last action — useful for holding a final frame while recording.
   */
  timelinePadAfterMs?: number;
  suggestedFilename: string;
};

export function presetScript(preset: VignettePreset): DemoScriptStep[] {
  return sceneScript(preset.scene, preset.scriptKey);
}

export function timelineDurationMs(preset: VignettePreset): number {
  return (
    scriptDurationMs(presetScript(preset)) +
    Math.max(0, preset.timelinePadAfterMs ?? 0)
  );
}

export const VIGNETTE_PRESETS: VignettePreset[] = [
  {
    id: "worktree-toast",
    label: worktreeToastScene.label,
    scene: worktreeToastScene,
    hideScriptCursor: false,
    defaultCrop: { x: 0.55, y: 0.42, w: 0.43, h: 0.55 },
    // A beat before show (4s) through Add-click settle (~8.3s).
    defaultRangeMs: { startMs: 3500, endMs: 10500 },
    // Hold the final frame so Out can extend past the last script action.
    timelinePadAfterMs: 10_000,
    suggestedFilename: "feature-git",
  },
  {
    id: "navigator",
    label: navigatorScene.label,
    scene: navigatorScene,
    hideScriptCursor: false,
    defaultCrop: { x: 0.0, y: 0.08, w: 0.28, h: 0.84 },
    defaultRangeMs: { startMs: 0, endMs: 11_000 },
    timelinePadAfterMs: 1_500,
    suggestedFilename: "feature-workspaces",
  },
  {
    id: "extension-todos",
    label: extensionTodosScene.label,
    scene: extensionTodosScene,
    hideScriptCursor: true,
    // Top-right: Claude terminal + Files/TODOs rail.
    defaultCrop: { x: 0.42, y: 0.08, w: 0.56, h: 0.84 },
    // Claude (~7.4s) → TODOs reveal at 7.8s → hold for a zoom finish.
    defaultRangeMs: { startMs: 0, endMs: 11_000 },
    timelinePadAfterMs: 4_000,
    suggestedFilename: "feature-extensions",
  },
  {
    id: "terminals-first",
    label: terminalsFirstScene.label,
    scene: terminalsFirstScene,
    hideScriptCursor: true,
    // Workbench with both side panels open.
    defaultCrop: { x: 0.0, y: 0.08, w: 1.0, h: 0.84 },
    // Cursor scrolls ~16s; Claude at 5s; Codex at 12s.
    defaultRangeMs: { startMs: 0, endMs: 16_000 },
    timelinePadAfterMs: 4_000,
    suggestedFilename: "feature-terminals",
  },
  {
    id: "hero-full",
    label: heroScene.label,
    scene: heroScene,
    hideScriptCursor: false,
    defaultCrop: { x: 0.0, y: 0.0, w: 1.0, h: 1.0 },
    suggestedFilename: "feature-hero",
  },
];

export function loadStoredCrop(presetId: string): CropRect | null {
  try {
    const raw = localStorage.getItem(`silo-vignette-crop:${presetId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CropRect;
    if (
      typeof parsed.x === "number" &&
      typeof parsed.y === "number" &&
      typeof parsed.w === "number" &&
      typeof parsed.h === "number"
    ) {
      return clampCrop(parsed);
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function storeCrop(presetId: string, crop: CropRect): void {
  localStorage.setItem(
    `silo-vignette-crop:${presetId}`,
    JSON.stringify(clampCrop(crop)),
  );
}

export function clampCrop(crop: CropRect): CropRect {
  const w = Math.min(1, Math.max(0.08, crop.w));
  const h = Math.min(1, Math.max(0.08, crop.h));
  const x = Math.min(1 - w, Math.max(0, crop.x));
  const y = Math.min(1 - h, Math.max(0, crop.y));
  return { x, y, w, h };
}

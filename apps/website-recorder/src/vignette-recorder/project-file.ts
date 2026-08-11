import { normalizeLoopBookendMode, type LoopBookendMode } from "./capture";
import { clampCrop, type CropRect, type VignettePreset } from "./presets";
import { clampTimelineRange, type TimelineRange } from "./timeline-math";
import {
  clampZoomFocus,
  clampZoomScale,
  clampZoomSegmentAmong,
  normalizeZoomEase,
  type ZoomSegment,
} from "./zoom-math";

export const PROJECT_FILE_VERSION = 1 as const;
export const PROJECT_LIBRARY_KEY = "silo-vignette-projects";
export const PROJECT_ACTIVE_KEY = "silo-vignette-active-project";
export const PROJECT_FILE_EXTENSION = ".silo-vignette.json";

export type VignetteProject = {
  version: typeof PROJECT_FILE_VERSION;
  id: string;
  name: string;
  updatedAt: string;
  presetId: string;
  suggestedFilename: string;
  fps: number;
  loopBookendMode: LoopBookendMode;
  crop: CropRect;
  range: TimelineRange;
  zoomSegments: ZoomSegment[];
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
};

type LibraryPayload = {
  version: 1;
  projects: VignetteProject[];
};

/** Minimal preset fields needed to seed / migrate projects. */
export type ProjectPresetSeed = Pick<
  VignettePreset,
  "id" | "label" | "suggestedFilename" | "defaultCrop" | "defaultRangeMs"
> & {
  durationMs: number;
};

export function defaultStorage(): StorageLike {
  if (typeof localStorage !== "undefined") return localStorage;
  const map = new Map<string, string>();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

export function newProjectId(): string {
  return `vp-${Math.random().toString(36).slice(2, 10)}`;
}

/** Safe download basename from a display name. */
export function slugifyFilename(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "vignette";
}

export function clampFps(fps: number): number {
  if (!Number.isFinite(fps)) return 30;
  return Math.min(60, Math.max(4, Math.round(fps)));
}

function normalizeZoomSegments(
  segments: unknown,
  durationMs: number,
): ZoomSegment[] {
  if (!Array.isArray(segments)) return [];
  const out: ZoomSegment[] = [];
  for (const item of segments) {
    if (
      !item ||
      typeof item !== "object" ||
      typeof (item as ZoomSegment).id !== "string" ||
      typeof (item as ZoomSegment).startMs !== "number" ||
      typeof (item as ZoomSegment).endMs !== "number" ||
      typeof (item as ZoomSegment).scale !== "number" ||
      typeof (item as ZoomSegment).focus?.x !== "number" ||
      typeof (item as ZoomSegment).focus?.y !== "number"
    ) {
      continue;
    }
    const segment = item as ZoomSegment;
    out.push(
      clampZoomSegmentAmong(
        {
          id: segment.id,
          startMs: segment.startMs,
          endMs: segment.endMs,
          scale: clampZoomScale(segment.scale),
          focus: clampZoomFocus(segment.focus),
          ease: normalizeZoomEase(segment.ease),
        },
        out,
        0,
        durationMs,
      ),
    );
  }
  return out.sort((a, b) => a.startMs - b.startMs);
}

export function normalizeProject(
  raw: unknown,
  durationMs: number,
): VignetteProject | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<VignetteProject>;
  if (value.version !== PROJECT_FILE_VERSION) return null;
  if (typeof value.id !== "string" || !value.id) return null;
  if (typeof value.name !== "string" || !value.name.trim()) return null;
  if (typeof value.presetId !== "string" || !value.presetId) return null;
  if (
    typeof value.crop?.x !== "number" ||
    typeof value.crop?.y !== "number" ||
    typeof value.crop?.w !== "number" ||
    typeof value.crop?.h !== "number"
  ) {
    return null;
  }
  if (
    typeof value.range?.startMs !== "number" ||
    typeof value.range?.endMs !== "number"
  ) {
    return null;
  }

  const range = clampTimelineRange(
    { startMs: value.range.startMs, endMs: value.range.endMs },
    durationMs,
  );
  const name = value.name.trim();
  return {
    version: PROJECT_FILE_VERSION,
    id: value.id,
    name,
    updatedAt:
      typeof value.updatedAt === "string" && value.updatedAt
        ? value.updatedAt
        : new Date().toISOString(),
    presetId: value.presetId,
    suggestedFilename:
      typeof value.suggestedFilename === "string" &&
      value.suggestedFilename.trim()
        ? slugifyFilename(value.suggestedFilename)
        : slugifyFilename(name),
    fps: clampFps(typeof value.fps === "number" ? value.fps : 30),
    loopBookendMode: normalizeLoopBookendMode(value.loopBookendMode),
    crop: clampCrop(value.crop),
    range,
    zoomSegments: normalizeZoomSegments(value.zoomSegments, durationMs),
  };
}

export function createProject(options: {
  name: string;
  preset: ProjectPresetSeed;
  crop?: CropRect;
  range?: TimelineRange;
  zoomSegments?: ZoomSegment[];
  fps?: number;
  loopBookendMode?: LoopBookendMode;
  suggestedFilename?: string;
  id?: string;
}): VignetteProject {
  const range = clampTimelineRange(
    options.range ??
      options.preset.defaultRangeMs ?? {
        startMs: 0,
        endMs: Math.min(options.preset.durationMs, 4500),
      },
    options.preset.durationMs,
  );
  const name = options.name.trim() || options.preset.suggestedFilename;
  return {
    version: PROJECT_FILE_VERSION,
    id: options.id ?? newProjectId(),
    name,
    updatedAt: new Date().toISOString(),
    presetId: options.preset.id,
    suggestedFilename: slugifyFilename(options.suggestedFilename ?? name),
    fps: clampFps(options.fps ?? 30),
    loopBookendMode: normalizeLoopBookendMode(
      options.loopBookendMode ?? "fade",
    ),
    crop: clampCrop(options.crop ?? options.preset.defaultCrop),
    range,
    zoomSegments: normalizeZoomSegments(
      options.zoomSegments ?? [],
      options.preset.durationMs,
    ),
  };
}

export function parseProjectFile(
  text: string,
  durationMsForPreset: (presetId: string) => number,
): VignetteProject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new Error("Project file is not valid JSON");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Project file is empty");
  }
  const presetId = (parsed as { presetId?: unknown }).presetId;
  if (typeof presetId !== "string" || !presetId) {
    throw new Error("Project file is missing presetId");
  }
  const project = normalizeProject(parsed, durationMsForPreset(presetId));
  if (!project) {
    throw new Error("Project file is missing required fields");
  }
  return project;
}

export function serializeProjectFile(project: VignetteProject): string {
  return `${JSON.stringify(project, null, 2)}\n`;
}

export function loadLibrary(
  storage: StorageLike = defaultStorage(),
): VignetteProject[] {
  try {
    const raw = storage.getItem(PROJECT_LIBRARY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LibraryPayload;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.projects)) {
      return [];
    }
    return parsed.projects.filter(
      (item): item is VignetteProject =>
        Boolean(item) &&
        typeof item === "object" &&
        item.version === PROJECT_FILE_VERSION &&
        typeof item.id === "string",
    );
  } catch {
    return [];
  }
}

export function saveLibrary(
  projects: VignetteProject[],
  storage: StorageLike = defaultStorage(),
): void {
  const payload: LibraryPayload = { version: 1, projects };
  storage.setItem(PROJECT_LIBRARY_KEY, JSON.stringify(payload));
}

export function getActiveProjectId(
  storage: StorageLike = defaultStorage(),
): string | null {
  return storage.getItem(PROJECT_ACTIVE_KEY);
}

export function setActiveProjectId(
  id: string,
  storage: StorageLike = defaultStorage(),
): void {
  storage.setItem(PROJECT_ACTIVE_KEY, id);
}

export function upsertProject(
  project: VignetteProject,
  storage: StorageLike = defaultStorage(),
): VignetteProject[] {
  const next = { ...project, updatedAt: new Date().toISOString() };
  const projects = loadLibrary(storage);
  const index = projects.findIndex((item) => item.id === next.id);
  if (index >= 0) {
    projects[index] = next;
  } else {
    projects.push(next);
  }
  saveLibrary(projects, storage);
  return projects;
}

export function deleteProject(
  id: string,
  storage: StorageLike = defaultStorage(),
): VignetteProject[] {
  const projects = loadLibrary(storage).filter((item) => item.id !== id);
  saveLibrary(projects, storage);
  if (getActiveProjectId(storage) === id) {
    storage.setItem(PROJECT_ACTIVE_KEY, projects[0]?.id ?? "");
  }
  return projects;
}

export function renameProject(
  id: string,
  name: string,
  storage: StorageLike = defaultStorage(),
): VignetteProject | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const projects = loadLibrary(storage);
  const index = projects.findIndex((item) => item.id === id);
  if (index < 0) return null;
  const updated: VignetteProject = {
    ...projects[index],
    name: trimmed,
    suggestedFilename: slugifyFilename(trimmed),
    updatedAt: new Date().toISOString(),
  };
  projects[index] = updated;
  saveLibrary(projects, storage);
  return updated;
}

/** Legacy per-preset keys used before named projects. */
export type LegacyPresetSettings = {
  crop: CropRect | null;
  range: TimelineRange | null;
  zoomSegments: ZoomSegment[];
};

export function readLegacyPresetSettings(
  presetId: string,
  durationMs: number,
  storage: StorageLike = defaultStorage(),
): LegacyPresetSettings {
  let crop: CropRect | null = null;
  let range: TimelineRange | null = null;
  let zoomSegments: ZoomSegment[] = [];

  try {
    const cropRaw = storage.getItem(`silo-vignette-crop:${presetId}`);
    if (cropRaw) {
      const parsed = JSON.parse(cropRaw) as CropRect;
      if (
        typeof parsed.x === "number" &&
        typeof parsed.y === "number" &&
        typeof parsed.w === "number" &&
        typeof parsed.h === "number"
      ) {
        crop = clampCrop(parsed);
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const rangeRaw = storage.getItem(`silo-vignette-range:${presetId}`);
    if (rangeRaw) {
      const parsed = JSON.parse(rangeRaw) as TimelineRange;
      if (
        typeof parsed.startMs === "number" &&
        typeof parsed.endMs === "number"
      ) {
        range = clampTimelineRange(parsed, durationMs);
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const zoomRaw = storage.getItem(`silo-vignette-zoom:${presetId}`);
    if (zoomRaw) {
      const parsed = JSON.parse(zoomRaw) as {
        version?: number;
        segments?: unknown;
      };
      if (parsed?.version === 2 && Array.isArray(parsed.segments)) {
        zoomSegments = normalizeZoomSegments(parsed.segments, durationMs);
      }
    }
  } catch {
    /* ignore */
  }

  return { crop, range, zoomSegments };
}

/**
 * Ensure a project library exists. Seeds from legacy per-preset localStorage
 * when empty; otherwise returns the stored library + active id.
 */
export function ensureProjectLibrary(
  presets: ProjectPresetSeed[],
  storage: StorageLike = defaultStorage(),
): { projects: VignetteProject[]; activeId: string } {
  let projects = loadLibrary(storage).map((project) => {
    const preset = presets.find((item) => item.id === project.presetId);
    const durationMs = preset?.durationMs ?? 10_000;
    return normalizeProject(project, durationMs) ?? project;
  });

  if (projects.length === 0) {
    for (const preset of presets) {
      const legacy = readLegacyPresetSettings(
        preset.id,
        preset.durationMs,
        storage,
      );
      const hasLegacy =
        legacy.crop != null ||
        legacy.range != null ||
        legacy.zoomSegments.length > 0;
      if (!hasLegacy && presets[0]?.id !== preset.id) continue;
      projects.push(
        createProject({
          name: hasLegacy ? preset.suggestedFilename : preset.suggestedFilename,
          preset,
          crop: legacy.crop ?? undefined,
          range: legacy.range ?? undefined,
          zoomSegments: legacy.zoomSegments,
        }),
      );
    }
    if (projects.length === 0 && presets[0]) {
      projects.push(
        createProject({
          name: presets[0].suggestedFilename,
          preset: presets[0],
        }),
      );
    }
    saveLibrary(projects, storage);
  }

  let activeId = getActiveProjectId(storage);
  if (!activeId || !projects.some((item) => item.id === activeId)) {
    activeId = projects[0]?.id ?? "";
    if (activeId) setActiveProjectId(activeId, storage);
  }

  return { projects, activeId };
}

export function projectDownloadName(project: VignetteProject): string {
  return `${slugifyFilename(project.name)}${PROJECT_FILE_EXTENSION}`;
}

import { useEffect, useMemo, useRef, useState } from "react";
import { DemoWorkspace, allWorkspaces } from "@silo-code/website/demo";
import {
  isDemoScriptClickStep,
  type DemoScriptStep,
} from "@silo-code/website/demo";
import { CropOverlay } from "./CropOverlay";
import {
  DEFAULT_LOOP_FADE_MS,
  downloadBlob,
  recordVignetteFrames,
  wait,
  type LoopBookendMode,
  type RecordedVignette,
} from "./capture";
import { cropToPixels, cropWithPixelSize, pixelsToCrop } from "./crop-math";
import {
  VIGNETTE_PRESETS,
  clampCrop,
  presetScript,
  timelineDurationMs,
  type CropRect,
  type VignettePreset,
} from "./presets";
import {
  createProject,
  ensureProjectLibrary,
  parseProjectFile,
  projectDownloadName,
  renameProject,
  serializeProjectFile,
  setActiveProjectId,
  slugifyFilename,
  upsertProject,
  type ProjectPresetSeed,
  type VignetteProject,
} from "./project-file";
import { ScriptTimeline } from "./ScriptTimeline";
import {
  clampTimelineRange,
  formatTimelineTime,
  type TimelineRange,
} from "./timeline-math";
import {
  clampZoomScale,
  clampZoomSegmentAmong,
  newZoomSegmentId,
  normalizeZoomEase,
  zoomStateAt,
  type ZoomEase,
  type ZoomSegment,
} from "./zoom-math";

/** Homepage story visual slot (CSS) — match this for feature assets. */
const HOMEPAGE_SLOT = { w: 719, h: 391 };

function presetSeeds(): ProjectPresetSeed[] {
  return VIGNETTE_PRESETS.map((preset) => ({
    id: preset.id,
    label: preset.label,
    suggestedFilename: preset.suggestedFilename,
    defaultCrop: preset.defaultCrop,
    defaultRangeMs: preset.defaultRangeMs,
    durationMs: timelineDurationMs(preset),
  }));
}

function findPreset(presetId: string): VignettePreset {
  return (
    VIGNETTE_PRESETS.find((item) => item.id === presetId) ?? VIGNETTE_PRESETS[0]
  );
}

function seedFor(presetId: string): ProjectPresetSeed {
  return presetSeeds().find((item) => item.id === presetId) ?? presetSeeds()[0];
}

function normalizeSegment(
  segment: ZoomSegment,
  durationMs: number,
  others: ZoomSegment[],
): ZoomSegment {
  return clampZoomSegmentAmong(segment, others, 0, durationMs);
}

function stepMarkerMs(script: DemoScriptStep[]): number[] {
  const markers: number[] = [];
  let t = 0;
  for (const step of script) {
    markers.push(t);
    if (isDemoScriptClickStep(step)) {
      t += step.afterMs + (step.holdMs ?? 880) + 260;
    } else {
      t += step.afterMs;
    }
  }
  return markers;
}

function formatTimecode(ms: number): string {
  const total = Math.max(0, ms) / 1000;
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  const f = Math.floor((total % 1) * 12);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}:${String(f).padStart(2, "0")}`;
}

function initFromLibrary(): {
  projects: VignetteProject[];
  active: VignetteProject;
} {
  const { projects, activeId } = ensureProjectLibrary(presetSeeds());
  const active = projects.find((item) => item.id === activeId) ?? projects[0];
  return { projects, active };
}

export function VignetteRecorder() {
  const boot = useMemo(() => initFromLibrary(), []);
  const [library, setLibrary] = useState<VignetteProject[]>(boot.projects);
  const [activeProjectId, setActiveProjectIdState] = useState(boot.active.id);
  const activeProject =
    library.find((item) => item.id === activeProjectId) ??
    library[0] ??
    boot.active;

  const [presetId, setPresetId] = useState(boot.active.presetId);
  const preset = useMemo(() => findPreset(presetId), [presetId]);
  const durationMs = useMemo(() => timelineDurationMs(preset), [preset]);
  const script = useMemo(() => presetScript(preset), [preset]);
  const markers = useMemo(() => stepMarkerMs(script), [script]);

  const [crop, setCrop] = useState<CropRect>(boot.active.crop);
  const [range, setRange] = useState<TimelineRange>(() =>
    clampTimelineRange(
      boot.active.range,
      timelineDurationMs(findPreset(boot.active.presetId)),
    ),
  );
  const [zoomSegments, setZoomSegments] = useState<ZoomSegment[]>(
    boot.active.zoomSegments,
  );
  const [selectedZoomId, setSelectedZoomId] = useState<string | null>(null);
  const selectedZoom =
    zoomSegments.find((segment) => segment.id === selectedZoomId) ?? null;
  const [scripting, setScripting] = useState(false);
  const [scriptGeneration, setScriptGeneration] = useState(0);
  const [playheadMs, setPlayheadMs] = useState(0);
  const [fps, setFps] = useState(boot.active.fps);
  const [loopBookend, setLoopBookend] = useState<LoopBookendMode>(
    boot.active.loopBookendMode,
  );
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RecordedVignette | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [posterUrl, setPosterUrl] = useState<string | null>(null);
  const [demoSize, setDemoSize] = useState({ w: 0, h: 0 });
  const abortRef = useRef<AbortController | null>(null);
  const stageDemoRef = useRef<HTMLDivElement>(null);
  const playOriginRef = useRef<{ wall: number; head: number } | null>(null);
  const hydratingRef = useRef(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  function applyProject(project: VignetteProject) {
    hydratingRef.current = true;
    const nextPreset = findPreset(project.presetId);
    const nextDuration = timelineDurationMs(nextPreset);
    const nextRange = clampTimelineRange(project.range, nextDuration);
    setActiveProjectIdState(project.id);
    setActiveProjectId(project.id);
    setPresetId(project.presetId);
    setCrop(project.crop);
    setRange(nextRange);
    setZoomSegments(project.zoomSegments);
    setFps(project.fps);
    setLoopBookend(project.loopBookendMode);
    setSelectedZoomId(null);
    setScriptGeneration((value) => value + 1);
    setScripting(false);
    setPlayheadMs(0);
    playOriginRef.current = null;
    queueMicrotask(() => {
      hydratingRef.current = false;
    });
  }

  function buildActiveProject(): VignetteProject {
    return {
      version: 1,
      id: activeProject.id,
      name: activeProject.name,
      updatedAt: activeProject.updatedAt,
      presetId,
      suggestedFilename: slugifyFilename(activeProject.name),
      fps,
      loopBookendMode: loopBookend,
      crop,
      range: clampTimelineRange(range, durationMs),
      zoomSegments,
    };
  }

  function mediaBasename(): string {
    return slugifyFilename(activeProject.name);
  }

  // Auto-save editor settings into the active project.
  useEffect(() => {
    if (hydratingRef.current) return;
    if (!activeProjectId) return;
    const next = upsertProject(buildActiveProject());
    setLibrary(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional field list
  }, [activeProjectId, presetId, crop, range, zoomSegments, fps, loopBookend]);

  useEffect(() => {
    setZoomSegments((current) =>
      current.map((segment, _index, all) =>
        normalizeSegment(segment, durationMs, all),
      ),
    );
  }, [durationMs]);

  useEffect(() => {
    if (
      selectedZoomId &&
      !zoomSegments.some((segment) => segment.id === selectedZoomId)
    ) {
      setSelectedZoomId(null);
    }
  }, [zoomSegments, selectedZoomId]);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (posterUrl) URL.revokeObjectURL(posterUrl);
    };
  }, [previewUrl, posterUrl]);

  useEffect(() => {
    const el = stageDemoRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      setDemoSize({
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      });
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [preset.id, scriptGeneration]);

  // Advance playhead while playing (or recording) in wall-clock sync.
  useEffect(() => {
    if (!scripting || recording) return;
    playOriginRef.current = {
      wall: performance.now(),
      head: playheadMs,
    };
    let raf = 0;
    const tick = () => {
      const origin = playOriginRef.current;
      if (!origin) return;
      const next = origin.head + (performance.now() - origin.wall);
      if (next >= durationMs) {
        setPlayheadMs(durationMs);
        setScripting(false);
        playOriginRef.current = null;
        return;
      }
      setPlayheadMs(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // Intentionally omit playheadMs — origin is captured when play starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scripting, recording, durationMs, scriptGeneration]);

  const cropPx =
    demoSize.w > 0 && demoSize.h > 0
      ? cropToPixels(crop, demoSize.w, demoSize.h)
      : null;

  function updateCrop(next: CropRect) {
    setCrop(clampCrop(next));
  }

  function updateRange(next: TimelineRange) {
    setRange(clampTimelineRange(next, durationMs));
  }

  function updateZoomSegment(next: ZoomSegment) {
    setZoomSegments((current) =>
      current.map((segment) =>
        segment.id === next.id
          ? normalizeSegment(next, durationMs, current)
          : segment,
      ),
    );
  }

  function removeSelectedZoom() {
    if (!selectedZoomId) return;
    setZoomSegments((current) =>
      current.filter((segment) => segment.id !== selectedZoomId),
    );
    setSelectedZoomId(null);
  }

  function addZoomSegment(scale: number) {
    // Span from playhead on the full timeline (not In→Out) so you can
    // place a pre-zoom before In.
    const span = Math.min(1000, Math.max(400, durationMs * 0.08));
    const startMs = Math.min(playheadMs, Math.max(0, durationMs - span));
    const draft: ZoomSegment = {
      id: newZoomSegmentId(),
      startMs: Math.max(0, startMs),
      endMs: Math.max(0, startMs) + span,
      scale: clampZoomScale(scale),
      focus: selectedZoom?.focus ?? { x: 0.5, y: 0.55 },
      ease: selectedZoom?.ease ?? (scale <= 1.01 ? "out" : "in"),
    };
    const next = normalizeSegment(draft, durationMs, zoomSegments);
    setZoomSegments((current) =>
      [...current, next].sort((a, b) => a.startMs - b.startMs),
    );
    setSelectedZoomId(next.id);
  }

  const liveZoomStyle = useMemo(() => {
    // During capture the encode path applies zoom — don't double-zoom the DOM.
    if (recording || zoomSegments.length === 0) return undefined;
    const state = zoomStateAt(zoomSegments, playheadMs);
    if (state.scale <= 1.001) return undefined;
    const originX = (crop.x + state.focus.x * crop.w) * 100;
    const originY = (crop.y + state.focus.y * crop.h) * 100;
    return {
      transform: `scale(${state.scale})`,
      transformOrigin: `${originX}% ${originY}%`,
    } as const;
  }, [recording, playheadMs, zoomSegments, crop.x, crop.y, crop.w, crop.h]);

  function play() {
    if (playheadMs >= durationMs) {
      setScriptGeneration((value) => value + 1);
      setPlayheadMs(0);
    }
    setScripting(true);
  }

  function pause() {
    setScripting(false);
    playOriginRef.current = null;
  }

  function restart() {
    setScriptGeneration((value) => value + 1);
    setPlayheadMs(0);
    setScripting(true);
    playOriginRef.current = null;
  }

  function seekTo(ms: number) {
    if (recording) return;
    const clamped = Math.max(0, Math.min(ms, durationMs));
    setScripting(false);
    playOriginRef.current = null;
    setPlayheadMs(clamped);
  }

  function resetCrop() {
    setCrop(preset.defaultCrop);
  }

  function applyHomepageSlotSize() {
    if (demoSize.w <= 0 || demoSize.h <= 0) return;
    updateCrop(
      cropWithPixelSize(
        crop,
        HOMEPAGE_SLOT.w,
        HOMEPAGE_SLOT.h,
        demoSize.w,
        demoSize.h,
      ),
    );
  }

  async function startRecording() {
    if (recording) return;
    setError(null);
    setRecording(true);
    setProgress("Cueing to In…");
    setScriptGeneration((value) => value + 1);
    setPlayheadMs(0);
    setScripting(true);
    playOriginRef.current = null;
    await wait(120);

    const controller = new AbortController();
    abortRef.current = controller;
    const rangeStart = range.startMs;
    const rangeEnd = range.endMs;
    const captureMs = Math.max(200, rangeEnd - rangeStart);

    try {
      const cueStart = performance.now();
      while (performance.now() - cueStart < rangeStart) {
        if (controller.signal.aborted) {
          throw new DOMException("Aborted", "AbortError");
        }
        setPlayheadMs(performance.now() - cueStart);
        setProgress(
          `Cueing… ${formatTimelineTime(performance.now() - cueStart)}`,
        );
        await wait(16, controller.signal);
      }
      setPlayheadMs(rangeStart);
      setProgress("Recording in/out…");

      const recorded = await recordVignetteFrames({
        crop,
        fps,
        durationMs: captureMs,
        signal: controller.signal,
        rangeStartMs: rangeStart,
        script,
        zoomSegments,
        loopBookendMode: loopBookend,
        loopFadeMs: loopBookend === "none" ? 0 : DEFAULT_LOOP_FADE_MS,
        onClock: (elapsed) => {
          setPlayheadMs(Math.min(durationMs, rangeStart + elapsed));
        },
        onFrame: (index, total, phase) => {
          setProgress(
            phase === "capture"
              ? `Capturing ${index + 1} / ~${total}…`
              : `Encoding ${index + 1} / ${total}…`,
          );
        },
      });

      setScripting(false);
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (posterUrl) URL.revokeObjectURL(posterUrl);
      setResult(recorded);
      setPreviewUrl(URL.createObjectURL(recorded.webmBlob));
      setPosterUrl(URL.createObjectURL(recorded.posterBlob));
      setProgress(
        `Done — ${recorded.frameCount} frames · ${recorded.width}×${recorded.height} · ${formatTimelineTime(captureMs)}`,
      );
    } catch (err) {
      setScripting(false);
      if (err instanceof DOMException && err.name === "AbortError") {
        setProgress("Cancelled");
      } else {
        setError(err instanceof Error ? err.message : String(err));
        setProgress(null);
      }
    } finally {
      abortRef.current = null;
      setRecording(false);
      playOriginRef.current = null;
    }
  }

  function stopRecording() {
    abortRef.current?.abort();
  }

  function switchProject(id: string) {
    const project = library.find((item) => item.id === id);
    if (!project || project.id === activeProjectId) return;
    applyProject(project);
  }

  function newProject() {
    const name = window.prompt("New project name", "untitled-vignette");
    if (name == null) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    const project = createProject({
      name: trimmed,
      preset: seedFor(presetId),
      crop,
      range,
      zoomSegments,
      fps,
      loopBookendMode: loopBookend,
    });
    const next = upsertProject(project);
    setLibrary(next);
    applyProject(project);
  }

  function renameActiveProject() {
    const name = window.prompt("Rename project", activeProject.name);
    if (name == null) return;
    const updated = renameProject(activeProject.id, name);
    if (!updated) return;
    setLibrary(upsertProject(updated));
  }

  function exportActiveProject() {
    const project = buildActiveProject();
    const blob = new Blob([serializeProjectFile(project)], {
      type: "application/json",
    });
    downloadBlob(blob, projectDownloadName(project));
  }

  async function importProjectFile(file: File) {
    try {
      const text = await file.text();
      const project = parseProjectFile(text, (id) =>
        timelineDurationMs(findPreset(id)),
      );
      // Keep imported id if present; upsert merges by id.
      const next = upsertProject(project);
      setLibrary(next);
      applyProject(next.find((item) => item.id === project.id) ?? project);
      setProgress(`Imported “${project.name}”`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // When the preset (script) changes, keep In/Out inside the new duration.
  useEffect(() => {
    if (hydratingRef.current) return;
    setRange((current) => clampTimelineRange(current, durationMs));
  }, [durationMs]);

  return (
    <div className="vignette-recorder nle-shell">
      <header className="nle-topbar">
        <div className="nle-brand">Silo · Vignette</div>
        <label className="vignette-field">
          <span>Project</span>
          <select
            value={activeProjectId}
            disabled={recording}
            onChange={(event) => switchProject(event.target.value)}
          >
            {library.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <div className="nle-topbar-actions nle-project-actions">
          <button type="button" disabled={recording} onClick={newProject}>
            New
          </button>
          <button
            type="button"
            disabled={recording}
            onClick={renameActiveProject}
          >
            Rename
          </button>
          <button
            type="button"
            disabled={recording}
            onClick={exportActiveProject}
          >
            Export
          </button>
          <button
            type="button"
            disabled={recording}
            onClick={() => importInputRef.current?.click()}
          >
            Import
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void importProjectFile(file);
            }}
          />
        </div>
        <label className="vignette-field">
          <span>Preset</span>
          <select
            value={preset.id}
            disabled={recording}
            onChange={(event) => setPresetId(event.target.value)}
          >
            {VIGNETTE_PRESETS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <label className="vignette-field">
          <span>FPS (output)</span>
          <input
            type="number"
            min={4}
            max={60}
            value={fps}
            disabled={recording}
            onChange={(event) => setFps(Number(event.target.value) || 30)}
          />
        </label>
        <label className="vignette-field">
          <span>Loop ends</span>
          <select
            value={loopBookend}
            disabled={recording}
            onChange={(event) =>
              setLoopBookend(event.target.value as LoopBookendMode)
            }
            title="Soft wrap for homepage <video loop>"
          >
            <option value="fade">Fade</option>
            <option value="dim">Dim</option>
            <option value="blur">Blur</option>
            <option value="none">None</option>
          </select>
        </label>
        <label className="vignette-field vignette-field-wide">
          <span>
            Crop px
            {demoSize.w > 0 ? ` · demo ${demoSize.w}×${demoSize.h}` : ""}
          </span>
          <input
            type="text"
            disabled={recording || !cropPx}
            value={
              cropPx ? `${cropPx.x} ${cropPx.y} ${cropPx.w} ${cropPx.h}` : "—"
            }
            onChange={(event) => {
              if (demoSize.w <= 0 || demoSize.h <= 0) return;
              const parts = event.target.value
                .trim()
                .split(/\s+/)
                .map((part) => Number(part));
              if (
                parts.length === 4 &&
                parts.every((n) => Number.isFinite(n))
              ) {
                updateCrop(
                  pixelsToCrop(
                    {
                      x: parts[0],
                      y: parts[1],
                      w: parts[2],
                      h: parts[3],
                    },
                    demoSize.w,
                    demoSize.h,
                  ),
                );
              }
            }}
          />
        </label>
        <div className="nle-topbar-actions">
          <button type="button" disabled={recording} onClick={resetCrop}>
            Reset crop
          </button>
          <button
            type="button"
            disabled={recording || demoSize.w === 0}
            onClick={applyHomepageSlotSize}
          >
            Size {HOMEPAGE_SLOT.w}×{HOMEPAGE_SLOT.h}
          </button>
        </div>
      </header>

      <div className="nle-main">
        <div className="nle-viewer">
          <div className="vignette-stage">
            <div className="vignette-stage-demo" ref={stageDemoRef}>
              <div className="vignette-stage-zoom" style={liveZoomStyle}>
                <DemoWorkspace
                  key={preset.id}
                  scene={preset.scene}
                  workspaceCatalog={allWorkspaces}
                  scriptKey={preset.scriptKey}
                  hideScriptCursor={preset.hideScriptCursor}
                  scripting={scripting}
                  scriptGeneration={scriptGeneration}
                  scriptClockMs={playheadMs}
                  scriptLoop={false}
                  pauseOnUserClick={false}
                  onScriptEnded={() => {
                    setScripting(false);
                    setPlayheadMs(durationMs);
                    playOriginRef.current = null;
                  }}
                />
              </div>
              <CropOverlay
                crop={crop}
                onChange={updateCrop}
                disabled={recording}
                sizeLabel={cropPx ? `${cropPx.w}×${cropPx.h}px` : undefined}
                showZoomFocus={Boolean(selectedZoom)}
                zoomFocus={selectedZoom?.focus ?? null}
                onChangeZoomFocus={(focus) => {
                  if (!selectedZoom) return;
                  updateZoomSegment({ ...selectedZoom, focus });
                }}
              />
            </div>
          </div>
        </div>

        <aside className="nle-monitor">
          <div className="nle-monitor-head">Program</div>
          {previewUrl ? (
            <video
              className="vignette-preview-video"
              src={previewUrl}
              autoPlay
              muted
              loop
              playsInline
              controls
            />
          ) : (
            <div className="vignette-preview-empty">
              Set In/Out on the timeline, hit Record. Preview appears here.
            </div>
          )}
          {posterUrl ? (
            <img
              className="vignette-preview-poster"
              src={posterUrl}
              alt="Poster frame"
            />
          ) : null}
          {result ? (
            <div className="vignette-preview-actions">
              <button
                type="button"
                className="is-primary"
                onClick={() =>
                  downloadBlob(result.webmBlob, `${mediaBasename()}.webm`)
                }
              >
                Download WebM
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadBlob(result.posterBlob, `${mediaBasename()}.png`)
                }
              >
                Download Poster
              </button>
            </div>
          ) : null}
          {progress ? <p className="vignette-status">{progress}</p> : null}
          {error ? <p className="vignette-error">{error}</p> : null}
        </aside>
      </div>

      <footer className="nle-bay">
        <div className="nle-transport">
          <button
            type="button"
            className="nle-transport-btn"
            disabled={recording}
            onClick={restart}
            title="Restart"
          >
            ⏮
          </button>
          {scripting && !recording ? (
            <button
              type="button"
              className="nle-transport-btn is-play"
              onClick={pause}
              title="Pause"
            >
              ⏸
            </button>
          ) : (
            <button
              type="button"
              className="nle-transport-btn is-play"
              disabled={recording}
              onClick={play}
              title="Play"
            >
              ▶
            </button>
          )}
          {recording ? (
            <button
              type="button"
              className="nle-transport-btn is-rec is-armed"
              onClick={stopRecording}
              title="Stop record"
            >
              ■
            </button>
          ) : (
            <button
              type="button"
              className="nle-transport-btn is-rec"
              onClick={() => void startRecording()}
              title="Record In→Out"
            >
              ● REC
            </button>
          )}
          <div className="nle-timecode" title="Playhead timecode">
            {formatTimecode(playheadMs)}
            <span> / {formatTimecode(durationMs)}</span>
          </div>
          <div className="nle-io-readout">
            <span>I {formatTimelineTime(range.startMs)}</span>
            <span>O {formatTimelineTime(range.endMs)}</span>
            {selectedZoom ? (
              <>
                <span>Z {formatTimelineTime(selectedZoom.startMs)}</span>
                <span>Ze {formatTimelineTime(selectedZoom.endMs)}</span>
              </>
            ) : null}
            <span className="nle-io-dur">
              Δ {formatTimelineTime(range.endMs - range.startMs)}
            </span>
          </div>
          <div className="nle-zoom-tools">
            <button
              type="button"
              className="nle-transport-btn"
              disabled={recording}
              onClick={() => addZoomSegment(1.55)}
              title="Add zoom-in ramp at the playhead"
            >
              + Zoom
            </button>
            <button
              type="button"
              className="nle-transport-btn"
              disabled={recording}
              onClick={() => addZoomSegment(1)}
              title="Add zoom-out ramp at the playhead"
            >
              + Zoom out
            </button>
            {selectedZoom ? (
              <>
                <label className="vignette-field">
                  <span>Scale</span>
                  <input
                    type="number"
                    min={1}
                    max={4}
                    step={0.05}
                    value={selectedZoom.scale}
                    disabled={recording}
                    onChange={(event) =>
                      updateZoomSegment({
                        ...selectedZoom,
                        scale: clampZoomScale(Number(event.target.value) || 1),
                      })
                    }
                  />
                </label>
                <label className="vignette-field">
                  <span>Ease</span>
                  <select
                    value={normalizeZoomEase(selectedZoom.ease)}
                    disabled={recording}
                    onChange={(event) =>
                      updateZoomSegment({
                        ...selectedZoom,
                        ease: event.target.value as ZoomEase,
                      })
                    }
                  >
                    <option value="none">None</option>
                    <option value="in">In</option>
                    <option value="out">Out</option>
                    <option value="in-out">In-out</option>
                  </select>
                </label>
                <button
                  type="button"
                  className="nle-transport-btn"
                  disabled={recording}
                  onClick={removeSelectedZoom}
                  title="Remove selected zoom"
                >
                  Remove
                </button>
              </>
            ) : null}
          </div>
        </div>

        <ScriptTimeline
          durationMs={durationMs}
          playheadMs={playheadMs}
          range={range}
          onChangeRange={updateRange}
          onSeek={seekTo}
          markers={markers}
          trackLabel={preset.label}
          disabled={recording}
          zoomSegments={zoomSegments}
          selectedZoomId={selectedZoomId}
          onSelectZoom={setSelectedZoomId}
          onChangeZoomSegment={updateZoomSegment}
        />
      </footer>
    </div>
  );
}

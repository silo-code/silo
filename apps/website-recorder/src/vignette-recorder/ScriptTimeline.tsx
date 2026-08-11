import {
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  clampTimelineRange,
  formatTimelineTime,
  type TimelineRange,
} from "./timeline-math";
import { clampZoomSegmentAmong, type ZoomSegment } from "./zoom-math";

type Props = {
  durationMs: number;
  playheadMs: number;
  range: TimelineRange;
  onChangeRange: (range: TimelineRange) => void;
  /** Scrub the playhead — pauses and seeks the live demo. */
  onSeek?: (ms: number) => void;
  /** Optional step markers (ms from start) shown on the ruler. */
  markers?: number[];
  trackLabel?: string;
  disabled?: boolean;
  zoomSegments?: ZoomSegment[];
  selectedZoomId?: string | null;
  onSelectZoom?: (id: string | null) => void;
  onChangeZoomSegment?: (segment: ZoomSegment) => void;
};

type DragKind = "in" | "out" | "move" | "playhead" | "zoom-start" | "zoom-end";

/**
 * NLE-style timeline: ruler, V1 track, in/out selection, scrubbable playhead,
 * multi zoom-ramp spans.
 */
export function ScriptTimeline({
  durationMs,
  playheadMs,
  range,
  onChangeRange,
  onSeek,
  markers = [],
  trackLabel = "V1 · Preset",
  disabled,
  zoomSegments = [],
  selectedZoomId = null,
  onSelectZoom,
  onChangeZoomSegment,
}: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    kind: DragKind;
    origin: TimelineRange;
    zoomId: string | null;
    originZoom: ZoomSegment | null;
    startX: number;
    trackWidth: number;
  } | null>(null);

  const ticks = useMemo(() => {
    const duration = Math.max(1, durationMs);
    const step = duration <= 10_000 ? 1000 : duration <= 30_000 ? 2000 : 5000;
    const items: { ms: number; major: boolean }[] = [];
    for (let ms = 0; ms <= duration + 0.5; ms += step / 2) {
      const snapped = Math.round(ms);
      if (snapped > duration) break;
      items.push({ ms: snapped, major: snapped % step === 0 });
    }
    if (items[items.length - 1]?.ms !== Math.round(duration)) {
      items.push({ ms: Math.round(duration), major: true });
    }
    return items;
  }, [durationMs]);

  function msFromClientX(clientX: number): number {
    const track = trackRef.current?.getBoundingClientRect();
    if (!track || track.width === 0) return 0;
    const ratio = Math.min(
      1,
      Math.max(0, (clientX - track.left) / track.width),
    );
    return ratio * durationMs;
  }

  useEffect(() => {
    function onMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag || drag.trackWidth <= 0) return;
      if (drag.kind === "playhead") {
        onSeek?.(msFromClientX(event.clientX));
        return;
      }
      if (
        (drag.kind === "zoom-start" || drag.kind === "zoom-end") &&
        drag.originZoom &&
        drag.zoomId
      ) {
        const ms = msFromClientX(event.clientX);
        const draft: ZoomSegment =
          drag.kind === "zoom-start"
            ? { ...drag.originZoom, startMs: ms }
            : { ...drag.originZoom, endMs: ms };
        onChangeZoomSegment?.(
          clampZoomSegmentAmong(draft, zoomSegments, 0, durationMs),
        );
        return;
      }
      const dx = event.clientX - drag.startX;
      const dMs = (dx / drag.trackWidth) * durationMs;
      const o = drag.origin;
      if (drag.kind === "in") {
        onChangeRange(
          clampTimelineRange(
            { startMs: o.startMs + dMs, endMs: o.endMs },
            durationMs,
          ),
        );
      } else if (drag.kind === "out") {
        onChangeRange(
          clampTimelineRange(
            { startMs: o.startMs, endMs: o.endMs + dMs },
            durationMs,
          ),
        );
      } else {
        const width = o.endMs - o.startMs;
        let startMs = o.startMs + dMs;
        startMs = Math.max(0, Math.min(startMs, durationMs - width));
        onChangeRange(
          clampTimelineRange({ startMs, endMs: startMs + width }, durationMs),
        );
      }
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
  }, [durationMs, onChangeRange, onSeek, onChangeZoomSegment, zoomSegments]);

  function startDrag(
    kind: DragKind,
    event: ReactPointerEvent,
    zoom?: ZoomSegment,
  ) {
    if (disabled) return;
    event.preventDefault();
    event.stopPropagation();
    const track = trackRef.current?.getBoundingClientRect();
    if (!track || track.width === 0) return;
    dragRef.current = {
      kind,
      origin: range,
      zoomId: zoom?.id ?? null,
      originZoom: zoom ? { ...zoom } : null,
      startX: event.clientX,
      trackWidth: track.width,
    };
    if (kind === "playhead") {
      onSeek?.(msFromClientX(event.clientX));
    }
    if (zoom) onSelectZoom?.(zoom.id);
  }

  function seekFromTrack(event: ReactPointerEvent<HTMLDivElement>) {
    if (disabled || !onSeek) return;
    if (
      (event.target as HTMLElement).closest(
        ".nle-selection, .nle-io, .nle-zoom-mark, .nle-zoom-span",
      )
    ) {
      return;
    }
    onSelectZoom?.(null);
    onSeek(msFromClientX(event.clientX));
    startDrag("playhead", event);
  }

  const playPct = Math.min(100, Math.max(0, (playheadMs / durationMs) * 100));
  const inPct = (range.startMs / durationMs) * 100;
  const outPct = (range.endMs / durationMs) * 100;
  const spanPct = Math.max(0.5, outPct - inPct);

  return (
    <div className={`nle-timeline${disabled ? " is-disabled" : ""}`}>
      <div className="nle-ruler" aria-hidden="true">
        <div className="nle-ruler-gutter" />
        <div className="nle-ruler-scale">
          {ticks.map((tick) => (
            <span
              key={tick.ms}
              className={`nle-ruler-tick${tick.major ? " is-major" : ""}`}
              style={{ left: `${(tick.ms / durationMs) * 100}%` }}
            >
              {tick.major ? <em>{formatTimelineTime(tick.ms)}</em> : null}
            </span>
          ))}
          {markers.map((ms) => (
            <i
              key={`m-${ms}`}
              className="nle-ruler-marker"
              style={{ left: `${(ms / durationMs) * 100}%` }}
              title={`Step @ ${formatTimelineTime(ms)}`}
            />
          ))}
        </div>
      </div>

      <div className="nle-track-row">
        <div className="nle-track-label">
          <span className="nle-track-badge">V1</span>
          <span className="nle-track-name">{trackLabel}</span>
        </div>
        <div className="nle-track" ref={trackRef} onPointerDown={seekFromTrack}>
          <div className="nle-track-film" />
          <div
            className="nle-selection"
            style={{ left: `${inPct}%`, width: `${spanPct}%` }}
            onPointerDown={(event) => startDrag("move", event)}
            title={`In→Out · ${formatTimelineTime(range.endMs - range.startMs)}`}
          />
          <button
            type="button"
            className="nle-io nle-io-in"
            style={{ left: `${inPct}%` }}
            aria-label="In point"
            title={`In ${formatTimelineTime(range.startMs)}`}
            disabled={disabled}
            onPointerDown={(event) => startDrag("in", event)}
          />
          <button
            type="button"
            className="nle-io nle-io-out"
            style={{ left: `${outPct}%` }}
            aria-label="Out point"
            title={`Out ${formatTimelineTime(range.endMs)}`}
            disabled={disabled}
            onPointerDown={(event) => startDrag("out", event)}
          />
          {zoomSegments.map((segment) => {
            const startPct = Math.min(
              100,
              Math.max(0, (segment.startMs / durationMs) * 100),
            );
            const endPct = Math.min(
              100,
              Math.max(0, (segment.endMs / durationMs) * 100),
            );
            const widthPct = Math.max(0.4, endPct - startPct);
            const selected = segment.id === selectedZoomId;
            return (
              <div key={segment.id}>
                <button
                  type="button"
                  className={`nle-zoom-span${selected ? " is-selected" : ""}`}
                  style={{ left: `${startPct}%`, width: `${widthPct}%` }}
                  aria-label={`Zoom ${formatTimelineTime(segment.startMs)} → ${formatTimelineTime(segment.endMs)} · ×${segment.scale.toFixed(2)}`}
                  title={`Zoom ×${segment.scale.toFixed(2)} · click to select`}
                  disabled={disabled}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onSelectZoom?.(segment.id);
                  }}
                />
                {selected ? (
                  <>
                    <button
                      type="button"
                      className="nle-zoom-mark nle-zoom-mark-start"
                      style={{ left: `${startPct}%` }}
                      aria-label="Zoom start"
                      title={`Zoom starts ${formatTimelineTime(segment.startMs)}`}
                      disabled={disabled}
                      onPointerDown={(event) =>
                        startDrag("zoom-start", event, segment)
                      }
                    />
                    <button
                      type="button"
                      className="nle-zoom-mark nle-zoom-mark-end"
                      style={{ left: `${endPct}%` }}
                      aria-label="Zoom end"
                      title={`Zoom ends ${formatTimelineTime(segment.endMs)}`}
                      disabled={disabled}
                      onPointerDown={(event) =>
                        startDrag("zoom-end", event, segment)
                      }
                    />
                  </>
                ) : null}
              </div>
            );
          })}
          <button
            type="button"
            className="nle-playhead"
            style={{ left: `${playPct}%` }}
            aria-label="Playhead"
            title="Drag to scrub"
            disabled={disabled}
            onPointerDown={(event) => startDrag("playhead", event)}
          >
            <i />
          </button>
        </div>
      </div>
    </div>
  );
}

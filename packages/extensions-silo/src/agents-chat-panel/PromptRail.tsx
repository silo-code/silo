/**
 * The Prompt Rail — one dash per user prompt down the transcript's right edge.
 *
 * Faint at rest. The dash under the cursor lengthens and darkens, its
 * neighbours less so ({@link tickEmphasis}), and a preview of that prompt
 * follows the cursor. Clicking jumps the transcript to it.
 *
 * Only the hover state and the measured rail height live here; every bit of
 * geometry and text is in `prompt-rail.ts`, where it is unit-tested.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import {
  type PromptTick,
  previewText,
  previewTop,
  tickAtY,
  tickEmphasis,
  tickLayout,
} from "./prompt-rail";

/** Dash length at rest and at full emphasis. */
const TICK_MIN_WIDTH_PX = 18;
const TICK_MAX_WIDTH_PX = 38;
/**
 * Dash opacity at rest and at full emphasis. The resting value carries the
 * whole "present but subtle" look — see the colour note in `acp-chat.css`,
 * which explains why the rail does not reach for a muted token as well.
 */
const TICK_MIN_OPACITY = 0.55;
const TICK_MAX_OPACITY = 1;

export function PromptRail({
  ticks,
  onSelect,
}: {
  readonly ticks: readonly PromptTick[];
  readonly onSelect: (key: string) => void;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [heightPx, setHeightPx] = useState(0);
  const [hovered, setHovered] = useState<number | null>(null);
  const [cursorY, setCursorY] = useState(0);
  const [previewHeightPx, setPreviewHeightPx] = useState(0);

  // The rail's own box changes with the panel, so a ResizeObserver sees every
  // case a window `resize` listener would miss (a dock split, a side column
  // opening, a drag of the panel divider).
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const measure = () => setHeightPx(el.clientHeight);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Measured rather than assumed: the card's height depends on how many lines
  // the prompt wraps to, and `previewTop` needs it to clamp correctly.
  useLayoutEffect(() => {
    setPreviewHeightPx(previewRef.current?.offsetHeight ?? 0);
  }, [hovered]);

  // One update per frame, not one per `mousemove`. A fast drag across the rail
  // fires events far faster than it paints, and each one re-renders every dash.
  const frameRef = useRef(0);
  const pendingRef = useRef<{ y: number } | null>(null);
  useEffect(() => () => cancelAnimationFrame(frameRef.current), []);

  const layout = tickLayout({ count: ticks.length, availablePx: heightPx });

  const onMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      pendingRef.current = { y: e.clientY - rect.top };
      if (frameRef.current !== 0) return;
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0;
        const next = pendingRef.current;
        if (!next) return;
        setCursorY(next.y);
        setHovered(
          tickAtY({
            y: next.y,
            count: ticks.length,
            pitchPx: layout.pitchPx,
            topPx: layout.topPx,
          }),
        );
      });
    },
    [ticks.length, layout.pitchPx, layout.topPx],
  );

  const onMouseLeave = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    frameRef.current = 0;
    pendingRef.current = null;
    setHovered(null);
  }, []);

  const onClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (hovered === null) return;
      const tick = ticks[hovered];
      if (!tick) return;
      // One of the two guards `panel-focus.ts` documents. Without it the click
      // bubbles to `onPanelClick` as a background click, which focuses the
      // composer — and that scrolls the transcript straight back to the
      // prompt we just left.
      e.preventDefault();
      onSelect(tick.key);
    },
    [hovered, ticks, onSelect],
  );

  const active = hovered === null ? undefined : ticks[hovered];

  return (
    <>
      <div
        className="acp-chat__prompt-rail"
        ref={railRef}
        onMouseMove={onMouseMove}
        onMouseLeave={onMouseLeave}
        onClick={onClick}
        data-hovered={hovered !== null ? "" : undefined}
        aria-hidden="true"
      >
        {ticks.map((tick) => {
          const e = tickEmphasis(tick.index, hovered);
          return (
            <span
              key={tick.key}
              className="acp-chat__prompt-tick"
              data-active={tick.index === hovered ? "" : undefined}
              style={{
                top: layout.topPx + layout.pitchPx * tick.index,
                width:
                  TICK_MIN_WIDTH_PX +
                  (TICK_MAX_WIDTH_PX - TICK_MIN_WIDTH_PX) * e,
                opacity:
                  TICK_MIN_OPACITY + (TICK_MAX_OPACITY - TICK_MIN_OPACITY) * e,
              }}
            />
          );
        })}
      </div>
      {active ? (
        <div
          className="acp-chat__prompt-preview"
          ref={previewRef}
          style={{
            top: previewTop({
              cursorY,
              cardHeightPx: previewHeightPx,
              boundsHeightPx: heightPx,
            }),
          }}
          aria-hidden="true"
        >
          {previewText(active.text)}
        </div>
      ) : null}
    </>
  );
}

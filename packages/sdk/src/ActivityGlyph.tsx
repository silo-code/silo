import type { CSSProperties, HTMLAttributes } from "react";
import {
  activityClass,
  activityJitterStyle,
  type Activity as ActivityKind,
  type ActivitySize,
} from "./activity";

/**
 * Host-painted activity glyph — same look on workspace rows, CenterDock tabs,
 * and extension UI. Pick an {@link Activity}; the host owns color and motion
 * (ADR 0030). Omit `activity` only for the workspace-row neutral gray fallback.
 *
 * Styled purely via host-provided `.silo-activity*` classes — no stylesheet
 * import is needed in the extension.
 *
 * Pass `jitterKey` whenever several animated glyphs render together (a list of
 * agent or workspace rows) so their pulses don't run in lockstep — and so each
 * one starts mid-cycle instead of freezing on first paint.
 *
 * @example
 * ```tsx
 * <ActivityGlyph activity="working" size="md" />
 * <ActivityGlyph activity="ready" jitterKey={row.id} />
 * <ActivityGlyph size="sm" /> // workspace neutral (omit)
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function ActivityGlyph({
  activity,
  size = "sm",
  className,
  jitterKey,
  style,
  ...rest
}: {
  activity?: ActivityKind;
  size?: ActivitySize;
  /**
   * Stable id (a row or terminal id — never an array index) that gives this
   * glyph a deterministic per-instance animation offset. Desynchronizes its
   * pulse from other glyphs rendered alongside it, and makes the animation
   * mount already in progress rather than pausing on first paint (a WebKit
   * quirk when the glyph appears inside a just-shown container). Inert on
   * non-animated glyphs.
   */
  jitterKey?: string;
} & Omit<HTMLAttributes<HTMLSpanElement>, "children">) {
  const classes = activityClass(activity, size);
  const mergedStyle =
    jitterKey != null
      ? ({ ...activityJitterStyle(jitterKey), ...style } as CSSProperties)
      : style;
  return (
    <span
      className={className ? `${classes} ${className}` : classes}
      style={mergedStyle}
      aria-hidden={rest["aria-label"] == null ? true : undefined}
      {...rest}
    />
  );
}

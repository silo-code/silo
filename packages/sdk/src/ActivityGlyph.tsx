import type { HTMLAttributes } from "react";
import {
  activityClass,
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
 * @example
 * ```tsx
 * <ActivityGlyph activity="working" size="md" />
 * <ActivityGlyph activity="ready" />
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
  ...rest
}: {
  activity?: ActivityKind;
  size?: ActivitySize;
} & Omit<HTMLAttributes<HTMLSpanElement>, "children">) {
  const classes = activityClass(activity, size);
  return (
    <span
      className={className ? `${classes} ${className}` : classes}
      aria-hidden={rest["aria-label"] == null ? true : undefined}
      {...rest}
    />
  );
}

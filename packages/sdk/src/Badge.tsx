import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { badgeClass, type BadgeSize, type BadgeTone } from "./badge-classes";

export type { BadgeSize, BadgeTone };

/**
 * A small pill for status or identity — on a {@link ListRow}'s trailing
 * slot, in a {@link SettingRow}'s control slot, next to a title. An
 * arbitrary `color` overrides `tone` for identity colors (e.g. workspace
 * group swatches) via the `--badge-color` custom property.
 *
 * Styled purely via host-provided `.silo-badge*` classes — no stylesheet
 * import is needed in the extension.
 *
 * Two sizes: the default `"md"` text chip (chrome−1, roomier pad), and
 * `"sm"` (chrome, pad `0 5px`) for counters beside a label. **Font size is
 * always an absolute chrome token** — never surrounding `em` / parent
 * cascade — so a badge looks the same in every pane.
 *
 * @example
 * ```tsx
 * <Badge tone="ok">Installed</Badge>
 * <Badge tone="warn">Update available</Badge>
 * <Badge tone="accent">current</Badge>
 * <Badge>primary</Badge>
 * <Badge tone="outline">Silo</Badge>
 * <Badge color="#e06c75">Frontend</Badge>
 * <Badge size="sm">{rows.length}</Badge>
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function Badge({
  tone = "neutral",
  size = "md",
  color,
  className,
  style,
  children,
  ...rest
}: {
  tone?: BadgeTone;
  /** Chip geometry — `"sm"` for counters, `"md"` (default) for text. */
  size?: BadgeSize;
  /** Arbitrary CSS color — overrides `tone` for identity colors. */
  color?: string;
  children?: ReactNode;
} & Omit<HTMLAttributes<HTMLSpanElement>, "children" | "color">) {
  const classes = badgeClass(tone, color, size);
  const mergedStyle: CSSProperties | undefined =
    color != null
      ? ({ ...style, ["--badge-color" as string]: color } as CSSProperties)
      : style;
  return (
    <span
      className={className ? `${classes} ${className}` : classes}
      style={mergedStyle}
      {...rest}
    >
      {children}
    </span>
  );
}

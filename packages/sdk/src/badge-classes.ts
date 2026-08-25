/**
 * Class-string mapping for {@link Badge} — pinned by unit tests so a rename
 * of the host contract classes fails CI (RFC 0016).
 *
 * @internal
 */
export type BadgeTone =
  | "neutral"
  | "accent"
  | "ok"
  | "warn"
  | "err"
  | "outline";

/**
 * Size axis for {@link Badge}. `"md"` is the default text chip; `"sm"` is the
 * tighter counter chip. Both resolve to absolute chrome-token font sizes in
 * the host — never parent `em`.
 *
 * @internal
 */
export type BadgeSize = "sm" | "md";

/**
 * Resolve the host `.silo-badge*` class string. An arbitrary `color` wins over
 * `tone` and selects `.silo-badge-custom` (fed via `--badge-color`). The
 * default `"md"` size adds no class, so existing markup is unchanged.
 *
 * @internal
 */
export function badgeClass(
  tone: BadgeTone = "neutral",
  color?: string,
  size: BadgeSize = "md",
): string {
  const toneClass = color != null ? "silo-badge-custom" : `silo-badge-${tone}`;
  const sizeClass = size === "sm" ? " silo-badge-sm" : "";
  return `silo-badge ${toneClass}${sizeClass}`;
}

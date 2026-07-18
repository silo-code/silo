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
 * Resolve the host `.silo-badge*` class string. An arbitrary `color` wins over
 * `tone` and selects `.silo-badge-custom` (fed via `--badge-color`).
 *
 * @internal
 */
export function badgeClass(
  tone: BadgeTone = "neutral",
  color?: string,
): string {
  if (color != null) return "silo-badge silo-badge-custom";
  return `silo-badge silo-badge-${tone}`;
}

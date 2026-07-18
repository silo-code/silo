/**
 * Class-string / data-attribute mapping for {@link EmptyState} — pinned by
 * unit tests so a rename of the host contract fails CI (RFC 0016).
 *
 * @internal
 */
export type EmptyStateTone = "ok" | "neutral";

/**
 * @internal
 */
export function emptyStateIconDataTone(
  tone: EmptyStateTone = "neutral",
): "ok" | undefined {
  // CSS keys the ok tone on data-tone="ok"; neutral is the default (no attr).
  return tone === "ok" ? "ok" : undefined;
}

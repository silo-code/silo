/**
 * Class-string / data-attribute mapping for {@link SegmentedTabs} — pinned
 * by unit tests so a rename of the host contract fails CI (RFC 0016).
 *
 * @internal
 */
export function segmentedTabDataActive(active: boolean): "true" | undefined {
  return active ? "true" : undefined;
}

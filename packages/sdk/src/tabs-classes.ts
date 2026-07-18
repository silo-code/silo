/**
 * Class-string / data-attribute mapping for {@link Tabs} — pinned by unit
 * tests so a rename of the host contract fails CI (RFC 0016).
 *
 * @internal
 */
export function tabDataActive(active: boolean): "true" | undefined {
  return active ? "true" : undefined;
}

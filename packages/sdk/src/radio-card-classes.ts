/**
 * `data-selected` value for {@link RadioCard} — pinned by unit tests so a
 * rename of the host contract attribute fails CI (RFC 0016).
 *
 * @internal
 */
export function radioCardDataSelected(selected: boolean): "true" | undefined {
  return selected ? "true" : undefined;
}

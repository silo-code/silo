/**
 * Class-string mapping for {@link SearchInput} — pinned by unit tests so a
 * rename of the host contract classes fails CI (RFC 0016).
 *
 * @internal
 */
export function searchInputClass(hasValue: boolean): string {
  return hasValue ? "silo-search-input has-value" : "silo-search-input";
}

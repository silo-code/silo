/**
 * `data-checked` value for {@link Switch}'s track — pinned by unit tests so
 * a rename of the host contract attribute fails CI (RFC 0016).
 *
 * @internal
 */
export function switchDataChecked(checked: boolean): "true" | "false" {
  return checked ? "true" : "false";
}

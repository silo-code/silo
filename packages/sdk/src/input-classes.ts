/**
 * Class-string mapping for {@link Input} — pinned by unit tests so a rename
 * of the host contract classes fails CI (RFC 0016).
 *
 * @internal
 */
export function inputClass(block = false): string {
  return block ? "silo-input silo-input-block" : "silo-input";
}

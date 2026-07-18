/**
 * Class-string mapping for {@link InlineEdit} — pinned by unit tests so a
 * rename of the host contract classes fails CI (RFC 0016).
 *
 * @internal
 */
export function inlineEditDisplayClass(multiline: boolean): string {
  return multiline
    ? "silo-inline-edit-display multiline"
    : "silo-inline-edit-display";
}

/**
 * @internal
 */
export function inlineEditRowClass(multiline: boolean): string {
  return multiline ? "silo-inline-edit-row multiline" : "silo-inline-edit-row";
}

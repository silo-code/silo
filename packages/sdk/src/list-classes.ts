/**
 * Class-string / data-attribute mapping for {@link ListRow} — pinned by unit
 * tests so a rename of the host contract fails CI (RFC 0016).
 *
 * @internal
 */
export type ListRowTruncate = "end" | "start";

/**
 * @internal
 */
export function listRowDataSelected(selected: boolean): "true" | undefined {
  return selected ? "true" : undefined;
}

/**
 * Front-truncation is expressed as `data-truncate="start"` on
 * `.silo-list-row-name`; end-truncation is the CSS default (no attribute).
 *
 * @internal
 */
export function listRowNameTruncate(
  truncate: ListRowTruncate = "end",
): "start" | undefined {
  return truncate === "start" ? "start" : undefined;
}

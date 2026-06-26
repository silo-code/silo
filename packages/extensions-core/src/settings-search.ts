export function rowMatches(
  row: { label: string; hint?: string },
  q: string,
): boolean {
  const lq = q.toLowerCase();
  return (
    row.label.toLowerCase().includes(lq) ||
    (row.hint?.toLowerCase().includes(lq) ?? false)
  );
}

// Filter sections by query (case-insensitive). A section whose title matches
// keeps all its rows; otherwise keep only matching rows. Sections that end up
// empty are dropped. Returns the original array unchanged when query is empty.
export function filterSections<R extends { label: string; hint?: string }>(
  sections: Array<{ title: string; rows: R[] }>,
  q: string,
): Array<{ title: string; rows: R[] }> {
  const lq = q.toLowerCase();
  if (!lq) return sections;
  return sections
    .map((sec) =>
      sec.title.toLowerCase().includes(lq)
        ? sec
        : { ...sec, rows: sec.rows.filter((r) => rowMatches(r, lq)) },
    )
    .filter((sec) => sec.rows.length > 0);
}

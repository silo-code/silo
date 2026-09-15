// The one place the dockview panel id of a recorded dock panel (RFC 0041) is
// composed. It lives in the `state/` leaf rather than next to
// `parseRecordedPanelId` (which needs the kind registry, and so can't) because
// both the record writer (`state/workspaces.ts`) and the load-path backfill
// (`state/persistence-model.ts`) stamp `DockPanelRecord.panelId` from it, and
// the leaf layering rule forbids either from importing out.
//
// Extensions never compose this string: they read `DockPanelRecord.panelId`.
// Keeping the format behind one function on this side of the SDK boundary is
// what lets it change without breaking anyone.

/** The dockview panel id for a recorded panel. */
export function recordedPanelId(kindId: string, recordId: string): string {
  return `${kindId}:${recordId}`;
}

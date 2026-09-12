/**
 * The pure set-difference behind reconciling a workspace's {@link
 * import("@silo-code/sdk").DockPanelRecord} list against its saved dock layout
 * (RFC 0041) — the same split editors and terminals already go through:
 *
 * - the **record list** is the source of truth for *which* recorded panels
 *   exist;
 * - the **dock layout** carries only *where* they sit.
 *
 * On restore the two can disagree:
 *
 * - a recorded-kind panel id in the **layout with no record** — a panel opened
 *   before records existed, or a record write that lagged the layout write.
 *   `WorkspaceDock` *adopts* it (its params carry everything the record needs),
 *   so the panel is never silently culled on an upgrade;
 * - a **record with no geometry** — opened while an older build saved the
 *   layout, or its group was pruned. `WorkspaceDock` floats it back in.
 *
 * `WorkspaceDock` owns the dockview side effects; this owns the arithmetic so
 * it can be tested without a live dock.
 */

export interface RecordedPanelReconcile {
  /** Recorded-panel ids present in the saved layout that have no record. */
  stale: string[];
  /** Records whose panel id is absent from the layout. */
  float: string[];
}

export function reconcileRecordedPanels(opts: {
  /** Every recorded panel's dockview id (`kind:recordId`). */
  recordPanelIds: readonly string[];
  /** Recorded-panel ids currently present in the layout geometry. */
  layoutPanelIds: readonly string[];
}): RecordedPanelReconcile {
  const records = new Set(opts.recordPanelIds);
  const layout = new Set(opts.layoutPanelIds);
  return {
    stale: opts.layoutPanelIds.filter((id) => !records.has(id)),
    float: opts.recordPanelIds.filter((id) => !layout.has(id)),
  };
}

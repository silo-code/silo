/**
 * Which panel id a {@link PanelPane} should show, given the ids currently in
 * the pane, the pane's local selection, and the store's saved tab for that
 * slot (`store.activeSidePanelTabs[slot]`).
 *
 * Used when the pane mounts, after hydration, and whenever the saved tab
 * changes (e.g. workspace switch while "Also maintain active tab(s)" is off —
 * ADR 0035). Prefer the saved id when it's still a member of the pane; fall
 * back to the first panel; keep the local selection when it already matches
 * (or when nothing is saved).
 */
export function resolveActiveSidePanelId(
  panelIds: readonly string[],
  activeId: string | null,
  savedId: string | undefined,
): string | null {
  if (panelIds.length === 0) return null;
  if (!activeId || !panelIds.includes(activeId)) {
    return savedId && panelIds.includes(savedId) ? savedId : panelIds[0];
  }
  if (savedId && savedId !== activeId && panelIds.includes(savedId)) {
    return savedId;
  }
  return activeId;
}

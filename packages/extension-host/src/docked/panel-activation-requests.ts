// Cross-workspace "make this panel active" requests.
//
// A caller outside the dock — `ctx.terminals.focus(id)` for a terminal that
// lives in a *different* workspace — cannot activate the target panel itself.
// The destination workspace's dock may not be mounted yet, and the moment it
// becomes active it runs its own active-panel restore (the panel that was
// showing when the workspace was last visited). An outside `setActive()` fired
// on a timer is racing that restore: whichever call lands last wins, so the
// requested tab flashes active and then flips back.
//
// So callers record the *intent* here instead, and `WorkspaceDock` — the single
// authority over which panel is active in its workspace — applies it. The
// request deliberately outlives mount and layout restore: the dock consumes it
// as soon as the panel exists (immediately if it's already there, otherwise
// from `onDidAddPanel`), and drops it when the workspace goes inactive again,
// by which point it has either been applied or the panel never showed up.
//
// Keyed by workspace id; one pending request per workspace (a newer request
// replaces an older one — the last caller's intent is the live one).

const requests = new Map<string, string>();

/**
 * Ask for `panelId` to be the active panel in `workspaceId`'s dock, applied by
 * that workspace's `WorkspaceDock` once it is active and the panel exists.
 *
 * @internal — host-side coordination; extensions reach this through
 * `ctx.terminals.focus()`.
 */
export function requestPanelActivation(
  workspaceId: string,
  panelId: string,
): void {
  requests.set(workspaceId, panelId);
}

/**
 * The panel id a caller is waiting to see active in `workspaceId`, or null.
 * Read-only — the dock clears it via {@link clearPanelActivation} once applied,
 * so a request for a not-yet-mounted panel survives until the panel appears.
 *
 * @internal
 */
export function peekPanelActivation(workspaceId: string): string | null {
  return requests.get(workspaceId) ?? null;
}

/**
 * Drop `workspaceId`'s pending request — after applying it, or when the
 * workspace goes inactive without it ever becoming applicable (so a stale
 * request can't yank a tab on some later, unrelated visit).
 *
 * @internal
 */
export function clearPanelActivation(workspaceId: string): void {
  requests.delete(workspaceId);
}

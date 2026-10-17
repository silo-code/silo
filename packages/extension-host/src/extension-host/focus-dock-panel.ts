import { activateWorkspace } from "../state/workspaces";
import {
  focusPanelContent,
  getActiveDockApi,
  getActiveDockWorkspaceId,
} from "../docked/dock-api-registry";
import { requestPanelActivation } from "../docked/panel-activation-requests";

/**
 * Switch to `workspaceId` and bring `panelId`'s dock tab to the front —
 * cross-workspace if needed. Shared by every `ctx.*.focus()` verb (terminal,
 * editor, panel) so the one subtle part — a cross-workspace request racing
 * `WorkspaceDock`'s own active-panel restore (ADR 0034) — is handled in
 * exactly one place instead of once per call site.
 *
 * No-op if `panelId` names no panel in the target (or, cross-workspace, the
 * eventual) dock.
 */
export function focusDockPanel(workspaceId: string, panelId: string): void {
  if (getActiveDockWorkspaceId() !== workspaceId) {
    // Cross-workspace — or same-workspace-on-paper-but-not-live-yet: check
    // dock identity, not store.activeWorkspaceId. A caller that already
    // flipped store.activeWorkspaceId itself (e.g. ctx.workspaces.activate()
    // immediately followed by this call) can win the store check before
    // WorkspaceDock's authority effect has actually committed the new dock as
    // live, making `store.activeWorkspaceId === workspaceId` true while the
    // dock behind it is still the old one. Trusting that would silently no-op
    // here (the old dock has no panel for this id) and drop the request
    // entirely — the tab never activates at all, not even a flash. Do NOT
    // reach for the target dock from here either: it may not be mounted yet,
    // and the moment it becomes active it runs its own active-panel restore —
    // a setActive() fired on a timer here would race that restore, and
    // whichever call lands last wins (the requested tab flashes active, then
    // flips back). Record the intent instead and let WorkspaceDock, the
    // single authority over its own active panel, apply it — and drive focus
    // — once its dock is up. activateWorkspace() is a no-op if workspaceId is
    // already store.activeWorkspaceId, so this is safe to call unconditionally.
    requestPanelActivation(workspaceId, panelId);
    activateWorkspace(workspaceId);
    return;
  }

  // Same workspace, dock confirmed live — nothing else is deciding its active
  // panel right now, so activate the tab directly.
  const panel = getActiveDockApi()?.getPanel(panelId);
  panel?.api.setActive();
  if (!panel) return;
  // Defer the actual focus grab past this tick, and scope it to this specific
  // panel's own content — not focusCenterDock()'s "whatever's visible in the
  // active group" search. With two-plus tabs in the same group, that generic
  // search can win the race against dockview's own (async, not synchronous
  // with setActive()) visibility toggle and land on the *previous* tab's
  // still-visible content, which reads as "some textarea in the group is
  // focused" and never retries again. Scoping to panel.view.content.element
  // removes every other panel from the search, so there's nothing left to
  // grab but the right one.
  requestAnimationFrame(() => focusPanelContent(panel.view.content.element));
}

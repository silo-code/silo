import type { Disposable } from "@silo-code/sdk";

/**
 * The active center-dock panel, for every kind — editor, terminal, or any
 * other `DockPanelKind` — published by `WorkspaceDock` on every active-panel
 * change. The one host-internal fact every "what is the user looking at"
 * consumer derives from: `agent-surface-registry.ts` resolves it to an Agent
 * Session, and `ctx.panels`'s active-panel state (RFC 0064) filters it to the
 * "panel" kind. Previously lived inside the agents module even though it
 * isn't an agent concept (noted in the ACP sprint plan); relocated here once
 * a second consumer needed it.
 */
export interface ActiveDockPanel {
  panelId: string;
  workspaceId: string | null;
}

let active: ActiveDockPanel | null = null;
const listeners = new Set<(active: ActiveDockPanel | null) => void>();

/**
 * Publish the active center-dock panel (or null when no dock is active).
 *
 * @internal — written only by `WorkspaceDock`, alongside `setActiveTerminal`.
 */
export function setActiveDockPanel(
  panelId: string | null,
  workspaceId: string | null = null,
): void {
  const same =
    panelId === null
      ? active === null
      : active !== null &&
        active.panelId === panelId &&
        active.workspaceId === workspaceId;
  if (same) return;
  active = panelId === null ? null : { panelId, workspaceId };
  for (const l of listeners) l(active);
}

/** @internal */
export function getActiveDockPanel(): ActiveDockPanel | null {
  return active;
}

/** @internal */
export function subscribeActiveDockPanel(
  listener: (active: ActiveDockPanel | null) => void,
): Disposable {
  listeners.add(listener);
  return { dispose: () => listeners.delete(listener) };
}

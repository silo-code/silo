/**
 * Which **surface** is showing which **Agent Session** (RFC 0038 Session 3.2).
 *
 * `ctx.agents` unified the *data* — one `AgentInfo` shape whether the agent
 * runs in a PTY or speaks the Agent Client Protocol. This module unifies the
 * *chrome*: it is the one place that knows an Agent Session id maps onto a
 * dock tab, so the host can route a tab adornment to it, answer "is the user
 * looking at this session", and close it — without any consumer branching on
 * `kind`.
 *
 * Two halves, because the two kinds arrive from opposite directions:
 *
 * - A **Terminal session**'s id *is* its terminal record id, and the host
 *   already tracks the active terminal tab (`active-terminal-registry.ts`).
 *   Nothing to register.
 * - A **Chat session** lives in a {@link DockPanelKind} panel, and only that
 *   panel knows which session it is showing. It declares it through
 *   `DockPanelApi.setAgentSession(id | null)` — the keystone verb — and the
 *   host wrapper in `dock-panel-kinds.ts` records it here.
 *
 * The panel→session direction is deliberately the primary index: a tab
 * adornment binder's `provide` is called synchronously for every tab during
 * render, so resolving "which session is this tab showing" must be a single
 * map read, never a scan.
 */

import type { Disposable } from "@silo-code/sdk";
import {
  getActiveTerminal,
  subscribeActiveTerminal,
} from "../active-terminal-registry";

/** What the host can do to a panel that declared an Agent Session, supplied by
 *  the panel's own dockview api (see `makeDockPanelApi`). */
export interface PanelSurfaceControls {
  /** Close the panel — the Chat analogue of closing a terminal tab, which is
   *  what `ctx.agents.close(id)` means for a session with no PTY. */
  close(): void;
}

interface PanelBinding {
  readonly sessionId: string;
  readonly controls: PanelSurfaceControls;
}

/** panelId → the Agent Session that panel is showing. */
const byPanel = new Map<string, PanelBinding>();
/** Agent Session id → panelId. Kept in step with {@link byPanel}. */
const panelBySession = new Map<string, string>();

let activePanelId: string | null = null;
let lastActiveSession: string | null = null;
const activeListeners = new Set<(id: string | null) => void>();

function resolveActiveSession(): string | null {
  // A Terminal session's id is its terminal record id, so the existing active-
  // terminal tracker already answers this for one of the two kinds.
  const terminalId = getActiveTerminal();
  if (terminalId) return terminalId;
  if (!activePanelId) return null;
  return byPanel.get(activePanelId)?.sessionId ?? null;
}

function emitActiveIfChanged(): void {
  const next = resolveActiveSession();
  if (next === lastActiveSession) return;
  lastActiveSession = next;
  for (const l of activeListeners) l(next);
}

// The active *terminal* tab and the active *panel* are published by different
// host seams (WorkspaceDock calls both). Either can change which Agent Session
// the user is looking at.
subscribeActiveTerminal(() => emitActiveIfChanged());

/**
 * Publish the active center-dock panel id (or null when no dock is active).
 *
 * @internal — written only by WorkspaceDock, alongside `setActiveTerminal`.
 */
export function setActiveDockPanel(panelId: string | null): void {
  if (panelId === activePanelId) return;
  activePanelId = panelId;
  emitActiveIfChanged();
}

/**
 * Bind (or, with `null`, unbind) the Agent Session a dock panel is showing.
 * Idempotent: re-declaring the same session for the same panel is a no-op, so
 * a panel may call it from a render effect.
 */
export function setPanelAgentSession(
  panelId: string,
  sessionId: string | null,
  controls: PanelSurfaceControls = { close: () => {} },
): void {
  const prev = byPanel.get(panelId);
  if (sessionId === null) {
    if (!prev) return;
    byPanel.delete(panelId);
    if (panelBySession.get(prev.sessionId) === panelId) {
      panelBySession.delete(prev.sessionId);
    }
    emitActiveIfChanged();
    return;
  }
  if (prev?.sessionId === sessionId) return;
  if (prev && panelBySession.get(prev.sessionId) === panelId) {
    panelBySession.delete(prev.sessionId);
  }
  byPanel.set(panelId, { sessionId, controls });
  panelBySession.set(sessionId, panelId);
  emitActiveIfChanged();
}

/** The Agent Session the given dock panel is showing, if it declared one. A
 *  single map read — see the note about `provide` at the top of this file. */
export function agentSessionForPanel(panelId: string): string | undefined {
  return byPanel.get(panelId)?.sessionId;
}

/** The panel showing this Agent Session, if any is mounted. */
export function panelForAgentSession(sessionId: string): string | undefined {
  return panelBySession.get(sessionId);
}

/** The panel controls for this Agent Session, if a panel declared it. */
export function panelControlsForAgentSession(
  sessionId: string,
): PanelSurfaceControls | undefined {
  const panelId = panelBySession.get(sessionId);
  return panelId ? byPanel.get(panelId)?.controls : undefined;
}

/** The Agent Session the user is currently looking at, either kind, or `null`. */
export function getActiveAgentSession(): string | null {
  return resolveActiveSession();
}

/** Subscribe to changes in {@link getActiveAgentSession}. */
export function subscribeActiveAgentSession(
  listener: (id: string | null) => void,
): Disposable {
  activeListeners.add(listener);
  return { dispose: () => activeListeners.delete(listener) };
}

/** @internal — test helper. */
export function _resetAgentSurfaceRegistryForTests(): void {
  byPanel.clear();
  panelBySession.clear();
  activePanelId = null;
  lastActiveSession = null;
  activeListeners.clear();
}

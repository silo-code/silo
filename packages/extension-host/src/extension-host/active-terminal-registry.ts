// Host-side tracker for the active terminal tab. WorkspaceDock publishes the
// active center-dock panel here whenever dockview's active panel changes (and
// null when an editor tab is active or the workspace deactivates); extensions
// read it via ctx.terminals.getActive() / subscribeActive().

let activeTerminalId: string | null = null;
const listeners = new Set<(id: string | null) => void>();

/**
 * Publish the active terminal record id (or null). No-ops when the value is
 * unchanged so per-render republishing doesn't spam subscribers.
 *
 * @internal — written only by WorkspaceDock.
 */
export function setActiveTerminal(id: string | null): void {
  if (id === activeTerminalId) return;
  activeTerminalId = id;
  for (const l of listeners) l(id);
}

/** The active terminal record id, or null when no terminal tab is active. */
export function getActiveTerminal(): string | null {
  return activeTerminalId;
}

/** Subscribe to active-terminal changes. */
export function subscribeActiveTerminal(
  listener: (id: string | null) => void,
): { dispose(): void } {
  listeners.add(listener);
  return { dispose: () => listeners.delete(listener) };
}

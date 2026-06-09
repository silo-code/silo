// Live state for the Cmd+`-driven workspace switcher popup. While the cycle
// modifier is held, `workspace-cycle.ts` publishes the frozen MRU list and the
// currently-highlighted id here; the always-mounted status item renders the
// `<WorkspaceSwitcher>` popup off this store. Highlight-only — the real
// `activate()` happens when the modifier is released (see workspace-cycle), so
// this store only describes what the popup should draw, never what is active.
//
// A tiny vanilla observable (same shape as workspace-properties.ts) so the popup
// can subscribe via `useSyncExternalStore` without reaching for app internals.

/** One row in the switcher popup. */
export interface SwitcherEntry {
  id: string;
  name: string;
}

/** The in-flight cycle session the popup renders; `null` when no popup is up. */
export interface SwitcherSession {
  /** Open workspaces in frozen MRU order, most-recent first. */
  entries: SwitcherEntry[];
  /** The id the popup highlights (the one that will activate on release). */
  selectedId: string;
}

let session: SwitcherSession | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Show/update the switcher popup, or pass `null` to dismiss it. */
export function setSwitcherSession(next: SwitcherSession | null): void {
  session = next;
  emit();
}

/** Current session (stable reference between changes), or `null` when hidden. */
export function getSwitcherSession(): SwitcherSession | null {
  return session;
}

/** Subscribe to session changes; returns an unsubscribe fn. */
export function subscribeSwitcherSession(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

import type { WorkspaceBadge, WorkspaceBadgeProvider } from "@silo-code/sdk";

// Host-side registry for workspace badge adornments (ADR 0029).

const binders: WorkspaceBadgeProvider[] = [];
/** workspaceId → badgeId → badge */
const imperative = new Map<string, Map<string, WorkspaceBadge>>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export const workspaceBadgeRegistry = {
  set(workspaceId: string, badge: WorkspaceBadge): void {
    let m = imperative.get(workspaceId);
    if (!m) {
      m = new Map();
      imperative.set(workspaceId, m);
    }
    m.set(badge.id, badge);
    notify();
  },

  clear(workspaceId: string, badgeId: string): void {
    const m = imperative.get(workspaceId);
    if (!m || !m.delete(badgeId)) return;
    if (m.size === 0) imperative.delete(workspaceId);
    notify();
  },

  bind(binder: WorkspaceBadgeProvider): { dispose(): void } {
    binders.push(binder);
    notify();
    return {
      dispose() {
        const i = binders.indexOf(binder);
        if (i !== -1) binders.splice(i, 1);
        notify();
      },
    };
  },

  /** @deprecated Prefer bind. */
  register(provider: WorkspaceBadgeProvider): { dispose(): void } {
    return workspaceBadgeRegistry.bind(provider);
  },

  getBadges(workspaceId: string): WorkspaceBadge[] {
    const badges: WorkspaceBadge[] = [];
    const set = imperative.get(workspaceId);
    if (set) {
      for (const badge of set.values()) badges.push(badge);
    }
    for (const p of binders) {
      const result = p.provide(workspaceId);
      if (result.length > 0) badges.push(...result);
    }
    return badges;
  },

  invalidate(): void {
    notify();
  },

  subscribe(listener: () => void): { dispose(): void } {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
  },

  /** @internal */
  _resetForTests(): void {
    binders.length = 0;
    imperative.clear();
    listeners.clear();
  },
};

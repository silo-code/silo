import type { WorkspaceBadge, WorkspaceBadgeProvider } from "@silo-code/sdk";

// Host-side registry for workspace row badge providers.
// Extensions register providers via ctx.workspaces.registerBadge().
// WorkspacesPanel subscribes via ctx.workspaces.subscribeBadges() and
// queries per-workspace badges via ctx.workspaces.getBadges().

const providers: WorkspaceBadgeProvider[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export const workspaceBadgeRegistry = {
  register(provider: WorkspaceBadgeProvider): { dispose(): void } {
    providers.push(provider);
    notify();
    return {
      dispose() {
        const i = providers.indexOf(provider);
        if (i !== -1) providers.splice(i, 1);
        notify();
      },
    };
  },

  getBadges(workspaceId: string): WorkspaceBadge[] {
    const badges: WorkspaceBadge[] = [];
    for (const p of providers) {
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
};

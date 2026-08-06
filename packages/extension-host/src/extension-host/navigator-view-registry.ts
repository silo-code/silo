import type { NavigatorView } from "@silo-code/sdk";

// Host-side registry for Navigator views (RFC 0023).
// Extensions register views via the public ctx.registerNavigatorView(); the
// read side (list/subscribe) is core-only, since painting the view selector
// and mounting the active body needs the React component references.
//
// The Workspaces view is in here like any other — core.workspaces registers it
// through the same public API, so first-party and third-party views are the
// same kind of thing.

const views: NavigatorView[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export const navigatorViewRegistry = {
  register(view: NavigatorView): { dispose(): void } {
    views.push(view);
    notify();
    return {
      dispose() {
        const i = views.indexOf(view);
        if (i !== -1) views.splice(i, 1);
        notify();
      },
    };
  },

  list(): NavigatorView[] {
    return [...views].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },

  subscribe(listener: () => void): { dispose(): void } {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
  },
};

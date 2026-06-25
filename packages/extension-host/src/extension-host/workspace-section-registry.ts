import type { WorkspaceSectionProvider } from "@silo-code/sdk";

// Host-side registry for workspace row section providers.
// Extensions register providers via ctx.workspaces.registerSection().
// WorkspacesPanel subscribes via ctx.workspaces.subscribeSection() and
// reads providers directly from this registry (core extension privilege).

const providers: WorkspaceSectionProvider[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export const workspaceSectionRegistry = {
  register(provider: WorkspaceSectionProvider): { dispose(): void } {
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

  list(): WorkspaceSectionProvider[] {
    return [...providers].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },

  subscribe(listener: () => void): { dispose(): void } {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
  },
};

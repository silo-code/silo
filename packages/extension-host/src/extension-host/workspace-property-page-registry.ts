import type { WorkspacePropertyPage } from "@silo-code/sdk";

// Host-side registry for workspace property pages (RFC 0015).
// Extensions register pages via ctx.workspaces.registerPropertyPage().
// The workspace properties modal reads pages via list() and re-renders on
// subscribe() notifications (core extension privilege, same pattern as
// workspace-section-registry).

const pages: WorkspacePropertyPage[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export const workspacePropertyPageRegistry = {
  register(page: WorkspacePropertyPage): { dispose(): void } {
    if (pages.some((p) => p.id === page.id)) {
      throw new Error(
        `workspacePropertyPageRegistry: duplicate id "${page.id}"`,
      );
    }
    pages.push(page);
    notify();
    return {
      dispose() {
        const i = pages.indexOf(page);
        if (i !== -1) pages.splice(i, 1);
        notify();
      },
    };
  },

  list(): WorkspacePropertyPage[] {
    return [...pages].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  },

  subscribe(listener: () => void): { dispose(): void } {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
  },
};

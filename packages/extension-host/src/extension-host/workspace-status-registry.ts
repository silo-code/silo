import type {
  WorkspaceStatusProvider,
  WorkspaceStatusRow,
} from "@silo-code/sdk";

// Host-side registry for workspace status providers.
// Extensions register providers via ctx.workspaces.registerStatus().
// WorkspacesPanel subscribes via ctx.workspaces.subscribeStatus() and
// queries per-workspace rows via ctx.workspaces.getStatus().

const providers: WorkspaceStatusProvider[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export const workspaceStatusRegistry = {
  register(provider: WorkspaceStatusProvider): { dispose(): void } {
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

  getStatus(workspaceId: string): WorkspaceStatusRow[] {
    const rows: WorkspaceStatusRow[] = [];
    for (const p of providers) {
      const result = p.provide(workspaceId);
      if (result.length > 0) rows.push(...result);
    }
    return rows;
  },

  invalidate(): void {
    notify();
  },

  subscribe(listener: () => void): { dispose(): void } {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
  },
};

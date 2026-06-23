import type {
  WorkspaceDecorationProvider,
  WorkspaceStatusRow,
} from "@silo-code/sdk";

// Host-side registry for workspace row decoration providers.
// Extensions register providers via ctx.workspaces.registerDecoration().
// WorkspacesPanel subscribes via ctx.workspaces.subscribeDecorations() and
// queries per-workspace rows via ctx.workspaces.getDecorations().

const providers: WorkspaceDecorationProvider[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export const workspaceDecorationRegistry = {
  register(provider: WorkspaceDecorationProvider): { dispose(): void } {
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

  getDecorations(workspaceId: string): WorkspaceStatusRow[] {
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

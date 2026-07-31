import type {
  WorkspaceStatusProvider,
  WorkspaceStatusRow,
} from "@silo-code/sdk";

// Host-side registry for workspace status adornments (ADR 0029).
// Imperative set/clear plus binders (bindStatus / deprecated registerStatus).

const binders: WorkspaceStatusProvider[] = [];
/** workspaceId → rowId → row */
const imperative = new Map<string, Map<string, WorkspaceStatusRow>>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export const workspaceStatusRegistry = {
  set(workspaceId: string, row: WorkspaceStatusRow): void {
    let m = imperative.get(workspaceId);
    if (!m) {
      m = new Map();
      imperative.set(workspaceId, m);
    }
    m.set(row.id, row);
    notify();
  },

  clear(workspaceId: string, rowId: string): void {
    const m = imperative.get(workspaceId);
    if (!m || !m.delete(rowId)) return;
    if (m.size === 0) imperative.delete(workspaceId);
    notify();
  },

  bind(binder: WorkspaceStatusProvider): { dispose(): void } {
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
  register(provider: WorkspaceStatusProvider): { dispose(): void } {
    return workspaceStatusRegistry.bind(provider);
  },

  getStatus(workspaceId: string): WorkspaceStatusRow[] {
    const rows: WorkspaceStatusRow[] = [];
    const set = imperative.get(workspaceId);
    if (set) {
      for (const row of set.values()) rows.push(row);
    }
    for (const p of binders) {
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

  /** @internal */
  _resetForTests(): void {
    binders.length = 0;
    imperative.clear();
    listeners.clear();
  },
};

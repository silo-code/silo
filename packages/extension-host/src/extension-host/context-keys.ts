import type { ContextKeys, Disposable } from "@silo-code/sdk";

// The `ContextKeys` shape is public (extensions name keys in `when` predicates),
// so it lives in @silo-code/sdk. The mutable store below is host-owned runtime.
// Re-export the type so host code importing it from "./context-keys" is unaffected.
export type { ContextKeys } from "@silo-code/sdk";

/** @internal — host-owned mutable store; extensions read keys via `when` predicates. */
export const contextKeys: ContextKeys = {
  activeViewerId: null,
  activeEditorId: null,
};

const listeners = new Set<() => void>();

/** @internal — host writes context keys; not part of the extension surface. */
export function setContextKey<K extends keyof ContextKeys>(
  key: K,
  value: ContextKeys[K],
): void {
  if (contextKeys[key] === value) return;
  contextKeys[key] = value;
  for (const l of listeners) l();
}

/** @internal — host subscribes to re-evaluate `when` clauses on key changes. */
export function onContextChange(fn: () => void): Disposable {
  listeners.add(fn);
  return {
    dispose: () => {
      listeners.delete(fn);
    },
  };
}

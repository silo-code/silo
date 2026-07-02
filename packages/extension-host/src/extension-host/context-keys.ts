import type { ContextKeys, Disposable } from "@silo-code/sdk";

// The `ContextKeys` shape is public (extensions name keys in `when` predicates),
// so it lives in @silo-code/sdk. The mutable store below is host-owned runtime.
// Re-export the type so host code importing it from "./context-keys" is unaffected.
export type { ContextKeys } from "@silo-code/sdk";

/** @internal — host-owned mutable store; extensions read keys via `when` predicates. */
export const contextKeys: ContextKeys = {
  activeEditorViewId: null,
  activeEditorId: null,
  activeViewerId: null, // deprecated alias — mirrored automatically by setContextKey
};

const listeners = new Set<() => void>();

/** @internal — host writes context keys; not part of the extension surface. */
export function setContextKey<K extends keyof ContextKeys>(
  key: K,
  value: ContextKeys[K],
): void {
  if (contextKeys[key] === value) return;
  contextKeys[key] = value;
  // Deprecated alias: `activeViewerId` mirrors `activeEditorViewId` here — the
  // single write point — so callers set one key and old compiled `when` clauses
  // can never drift out of sync. Remove with ContextKeys.activeViewerId.
  if (key === "activeEditorViewId") {
    contextKeys.activeViewerId = value as ContextKeys["activeEditorViewId"];
  }
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

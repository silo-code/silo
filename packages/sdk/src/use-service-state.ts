import { useCallback, useSyncExternalStore } from "react";
import type { Disposable } from "./types";

/**
 * The minimal reactive contract every stateful `ctx` service satisfies: a
 * `getState` returning a stable, frozen value and a `subscribe` that fires
 * on change. This is exactly what React's `useSyncExternalStore` needs — and
 * the only shape {@link useServiceState} requires.
 *
 * @category Consumer Services
 * @public
 */
export interface ReactiveService<T> {
  getState(): T;
  subscribe(listener: (s: T) => void): Disposable;
}

/**
 * Subscribe a React component to a `ctx` service's reactive state. Returns the
 * service's current state and re-renders when it changes — the one blessed
 * way to read service state in an extension. Use it for every domain
 * ({@link ExtensionContext.workspaces | workspaces},
 * {@link ExtensionContext.layout | layout},
 * {@link ExtensionContext.theme | theme}, …) rather than re-implementing the
 * `useSyncExternalStore` boilerplate per call site.
 *
 * @example
 * ```tsx
 * function Panel({ ctx }: { ctx: ExtensionContext }) {
 *   const ws = useServiceState(ctx.workspaces);
 *   return <span>{ws.open.length} open workspaces</span>;
 * }
 * ```
 *
 * @category Consumer Services
 * @public
 */
export function useServiceState<T>(service: ReactiveService<T>): T {
  return useSyncExternalStore(
    useCallback((cb) => service.subscribe(cb).dispose, [service]),
    service.getState,
  );
}

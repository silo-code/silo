import type { Disposable } from "@silo-code/sdk";

// A tiny channel from the "Find in Files" command (Cmd+Shift+F) to the live
// Search view. The command can't reach React state directly, so it publishes a
// request here; the view consumes it on mount (for a lazy-mounted, not-yet-shown
// panel) and live via the subscription (when it's already open).

/** What the command asks the panel to do when it opens. */
export interface SearchRequest {
  /** Seed the query box with this text and run a search. Omitted = just focus. */
  query?: string;
}

let pending: SearchRequest | null = null;
const listeners = new Set<(req: SearchRequest) => void>();

/** Publish a search request: stored as pending and pushed to a live view. */
export function requestSearch(req: SearchRequest): void {
  pending = req;
  for (const l of listeners) l(req);
}

/** Take (and clear) any pending request — the view calls this on mount. */
export function takePendingSearch(): SearchRequest | null {
  const req = pending;
  pending = null;
  return req;
}

/** Subscribe to live search requests (for an already-mounted view). */
export function onSearchRequest(fn: (req: SearchRequest) => void): Disposable {
  listeners.add(fn);
  return {
    dispose: () => {
      listeners.delete(fn);
    },
  };
}

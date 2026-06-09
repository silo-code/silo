import type { GitAPI } from "../git/git-api";

// Bridges the git-explorer view's React components (which have no `ctx`) to the
// live `silo.git` provider. The view extension's `activate` installs a resolver
// that calls `ctx.getExtension("silo.git")`; components read the API at use time
// via `getGitApi()` and degrade gracefully when the provider is absent
// (disabled / not yet active) — the view shows a placeholder rather than crash.

let resolve: (() => GitAPI | undefined) | null = null;

/** Installed by the view extension's activate. @internal */
export function setGitApiResolver(r: () => GitAPI | undefined): void {
  resolve = r;
}

/** The live GitAPI, or `undefined` if the `silo.git` provider isn't available. */
export function getGitApi(): GitAPI | undefined {
  return resolve?.();
}

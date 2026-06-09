import { appName, appVersion } from "../services/tauri-app";

// App identity metadata (version, name), exposed on the PRIVILEGED
// `@silo-code/extension-host/internal` barrel — core.* only — rather than public `@silo-code/sdk`.
//
// Why internal, not public `ctx.app`: the only consumer is `core.about`, which
// is part of Silo's identity (a core extension, not an independently-shipped
// silo.*/third-party one). App identity is host-owned metadata a *core*
// extension reads; it is not a capability the public surface needs to hand to
// arbitrary extensions. Per the public-first rule (ctx-domains.md → "Extension
// trust tiers"), a capability only a core extension needs goes on the internal
// barrel — and importing it from `@silo-code/extension-host/internal` is the marked, greppable
// record of that privileged use. If a silo.*/third-party need ever appears,
// this graduates to a public `ctx.app` domain instead.

/**
 * Read-only application identity metadata for **core** extensions, exposed via
 * the privileged `@silo-code/extension-host/internal` barrel (not public `@silo-code/sdk`). Obtain
 * an instance with {@link getAppService}.
 *
 * @internal
 */
export interface AppService {
  /** The application version from the bundle manifest, e.g. `"0.2.0"`. */
  getVersion(): Promise<string>;
  /** The application's display name, e.g. `"Silo"`. */
  getName(): Promise<string>;
}

let service: AppService | null = null;

/**
 * Host factory for {@link AppService}, re-exported from `@silo-code/extension-host/internal`
 * for core extensions (e.g. `core.about`). Returns a shared singleton.
 *
 * @internal
 */
export function getAppService(): AppService {
  if (service) return service;
  service = { getVersion: appVersion, getName: appName };
  return service;
}

/**
 * Shared dependency injection for runtime-loaded (third-party) extensions.
 *
 * A pre-built extension bundle treats `react`, `react/jsx-runtime`, and
 * `@silo-code/sdk` as **externals** — it does not bundle its own copies. At load time
 * the loader rewrites those bare import specifiers to point at the host's
 * instances, which we publish here on `globalThis`. This guarantees:
 *
 * - a **single React instance** across the host↔extension boundary (otherwise
 *   hooks throw "invalid hook call"), and
 * - a **single SDK instance**, so the extension shares the host's singleton
 *   services (e.g. `ctx.layout` is the same object the host drives).
 *
 * `import * as React from "react"` resolves to the exact module the app renders
 * with (Vite/Rollup dedupe react), and `import * as Sdk from "@silo-code/sdk"` is the same
 * barrel `ctx` is built from — so the published namespaces are the live host
 * instances, not copies.
 *
 * @internal
 */
import * as React from "react";
import * as ReactJsxRuntime from "react/jsx-runtime";
import * as Sdk from "@silo-code/sdk";

/** The well-known external specifiers a runtime extension may import. */
export const SHARED_DEPS = [
  "react",
  "react/jsx-runtime",
  "@silo-code/sdk",
] as const;

export type SharedDepId = (typeof SHARED_DEPS)[number];

declare global {
  // eslint-disable-next-line no-var
  var __SILO_DEPS__: Record<string, unknown> | undefined;
}

let installed = false;

/**
 * Publish the host's React + SDK module namespaces on `globalThis.__SILO_DEPS__`
 * so the loader's per-dep shim modules can re-export them. Idempotent; safe to
 * call from `activateBuiltins()` before any extension loads.
 * @internal
 */
export function installExtensionDeps(): void {
  if (installed) return;
  installed = true;
  globalThis.__SILO_DEPS__ = {
    react: React,
    "react/jsx-runtime": ReactJsxRuntime,
    "@silo-code/sdk": Sdk,
  };
}

import { syncMenu } from "./menu-items";
import { registerBuiltins } from "./builtins-registry";
import { installExtensionDeps } from "./extension-deps";
import type { Extension } from "@silo-code/sdk";

let activated = false;

/**
 * Activate a set of extensions against fresh host contexts. The host no longer
 * owns the list of bundled extensions — the composition root (the app) supplies
 * it, which keeps the host package free of any dependency on the extension
 * packages (`@silo-code/extensions-{core,silo}`) and the package graph acyclic.
 * The caller is responsible for ordering (e.g. register providers before the
 * views that consume them).
 *
 * Each built-in's context is retained by the {@link ./builtins-registry | builtin
 * registry} so it can later be hot-disabled from the Extensions page; any id in
 * `disabledBuiltins` (the user's persisted choices) is recorded but not
 * activated, so a disabled built-in never contributes to the first frame.
 */
export function activateExtensions(
  builtins: Extension[],
  disabledBuiltins: ReadonlySet<string> = new Set(),
): void {
  if (activated) return;
  activated = true;
  // Publish the host's React + SDK instances for runtime-loaded extensions to
  // share (before any such extension can load). See extension-deps.ts.
  installExtensionDeps();
  // The builtin registry pre-records every id (so handles resolve regardless of
  // order or disabled state), then activates each one not disabled, retaining
  // its context for hot enable/disable.
  registerBuiltins(builtins, disabledBuiltins);
  void syncMenu().catch((err) => {
    console.error("[extensions] syncMenu failed", err);
  });
}

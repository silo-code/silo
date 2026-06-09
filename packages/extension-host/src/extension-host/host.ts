import { createContext } from "./context";
import { syncMenu } from "./menu-items";
import { recordExtension, activateExtensionRecord } from "./extension-registry";
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
 */
export function activateExtensions(builtins: Extension[]): void {
  if (activated) return;
  activated = true;
  // Publish the host's React + SDK instances for runtime-loaded extensions to
  // share (before any such extension can load). See extension-deps.ts.
  installExtensionDeps();
  // Pre-record all ids so an extension can resolve a handle to one that
  // activates later (getExtension tolerates not-yet-active providers).
  for (const ext of builtins) recordExtension(ext.id);
  for (const ext of builtins) {
    try {
      // Builtins are first-party — trusted, so `files`/`process` are unscoped.
      const ctx = createContext(ext.id, { trusted: true });
      // An extension may return an API object to publish for others to consume.
      const api = ext.activate(ctx);
      activateExtensionRecord(ext.id, api);
    } catch (err) {
      console.error(`[extensions] activate failed: ${ext.id}`, err);
    }
  }
  void syncMenu().catch((err) => {
    console.error("[extensions] syncMenu failed", err);
  });
}

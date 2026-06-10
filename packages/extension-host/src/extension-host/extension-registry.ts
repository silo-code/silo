import type { ExtensionHandle } from "@silo-code/sdk";

// Host-side record of known extensions and the APIs they publish. Backs
// ExtensionContext.getExtension, the mechanism that lets one extension consume
// another's published API (see docs/architecture-audit/ctx-domains.md →
// "Inter-extension API mechanism").

interface ExtensionEntry {
  id: string;
  active: boolean;
  api: unknown;
}

const entries = new Map<string, ExtensionEntry>();

/**
 * Declare an extension id before any activation runs, so a handle to it can be
 * resolved even by an extension that activates earlier.
 * @internal
 */
export function recordExtension(id: string): void {
  if (!entries.has(id)) entries.set(id, { id, active: false, api: undefined });
}

/**
 * Mark an extension active and store the API its `activate` returned.
 * @internal
 */
export function activateExtensionRecord(id: string, api: unknown): void {
  const entry = entries.get(id) ?? { id, active: false, api: undefined };
  entry.active = true;
  entry.api = api;
  entries.set(id, entry);
}

/**
 * Drop an extension's record entirely — used when a runtime-loaded extension is
 * disabled or uninstalled, so `getExtension(id)` no longer resolves a handle to
 * it. (Builtins are never cleared — see {@link deactivateExtensionRecord}.)
 * @internal
 */
export function clearExtensionRecord(id: string): void {
  entries.delete(id);
}

/**
 * Mark an extension inactive and drop its published API, **keeping the record**
 * so `getExtension(id)` still resolves a handle (with `active: false`,
 * `api: undefined`). Used when a built-in is hot-disabled: unlike a third-party
 * extension (which is cleared on unload), a built-in id stays known, so a
 * consumer like `silo.git-explorer` resolving `getExtension("silo.git")` sees an
 * inactive provider and falls back to its placeholder rather than getting
 * `undefined`. Re-enabling calls {@link activateExtensionRecord} to flip it back.
 * @internal
 */
export function deactivateExtensionRecord(id: string): void {
  const entry = entries.get(id);
  if (!entry) return;
  entry.active = false;
  entry.api = undefined;
}

/**
 * Resolve a handle to another extension. Returns a snapshot of its current
 * state at call time (`undefined` if the id is unknown). Consumers call this at
 * use time and tolerate `api` being `undefined`.
 * @internal
 */
export function getExtensionHandle<API = unknown>(
  id: string,
): ExtensionHandle<API> | undefined {
  const entry = entries.get(id);
  if (!entry) return undefined;
  return {
    id: entry.id,
    active: entry.active,
    api: entry.api as API | undefined,
  };
}

/**
 * Lifecycle registry for **built-in** extensions — the first-party `core.*` /
 * `silo.*` set the composition root hands to {@link activateExtensions}. Unlike
 * runtime-loaded third-party extensions (owned by the {@link
 * ./extension-manager | extension manager}, which loads bundles from disk), a
 * built-in has no folder, no install/uninstall, and no permission consent: it's
 * activated in-process from an in-memory {@link Extension} object.
 *
 * What this module adds over the old fire-and-forget activation is **retention**:
 * each active built-in's {@link ExtensionContext} (and thus its `subscriptions`)
 * is kept, so a built-in can be hot-**disabled** — its contributions disposed
 * live, exactly as {@link ./extension-loader.unloadExtension} does for
 * third-party — and hot-**enabled** again. The `silo.*` set surfaces in the
 * Extensions settings page (disable-only, branded "Silo"); `core.*` is the
 * immutable shell and is excluded from {@link builtinRows}.
 *
 * @internal
 */
import { createContext } from "./context";
import { syncMenu } from "./menu-items";
import {
  recordExtension,
  activateExtensionRecord,
  deactivateExtensionRecord,
} from "./extension-registry";
import { dockPanelKindRegistry } from "./dock-panel-kinds";
import type { Extension, ExtensionContext } from "@silo-code/sdk";

/** Brand shown for every built-in row (built-ins are first-party Silo). */
const BUILTIN_PUBLISHER = "Silo";
/** Version shown when a built-in's manifest omits one. */
const DEFAULT_BUILTIN_VERSION = "1.0.0";

interface BuiltinEntry {
  ext: Extension;
  /** Retained while active so its contributions can be disposed on disable. */
  ctx?: ExtensionContext;
  enabled: boolean;
  /**
   * True once this built-in was seen to contribute a dock panel kind — those
   * can't be unmounted from an already-mounted dock, so disabling needs a
   * window reload to fully take effect (mirrors the third-party loader).
   */
  reloadRequired: boolean;
}

/** One built-in row for the Extensions list (`silo.*` only; `core.*` excluded). */
export interface BuiltinExtensionRow {
  id: string;
  name: string;
  description?: string;
  version: string;
  /** Always {@link BUILTIN_PUBLISHER} ("Silo"). */
  publisher: string;
  builtin: true;
  enabled: boolean;
  reloadRequired: boolean;
}

// Insertion order is preserved and equals the composition root's activation
// order (providers before the views that consume them).
const entries = new Map<string, BuiltinEntry>();

/** Create + retain a context, activate, record the API, and detect dock kinds. */
function activate(entry: BuiltinEntry): void {
  const dockBefore = new Set(dockPanelKindRegistry.list().map((k) => k.id));
  // Builtins are first-party — trusted, so `files`/`process` are unscoped.
  const ctx = createContext(entry.ext.id, { trusted: true });
  const api = entry.ext.activate(ctx);
  activateExtensionRecord(entry.ext.id, api);
  entry.ctx = ctx;
  entry.enabled = true;
  const dockAfter = dockPanelKindRegistry.list().map((k) => k.id);
  if (dockAfter.some((id) => !dockBefore.has(id))) entry.reloadRequired = true;
}

/** Dispose the retained context's contributions, deactivate, mark inactive. */
function teardown(entry: BuiltinEntry): void {
  if (entry.ctx) {
    // Reverse registration order; each registry dispose fires onChange, so
    // status items / side panels / settings pages / commands leave reactively.
    for (const d of [...entry.ctx.subscriptions].reverse()) safeDispose(d);
  }
  try {
    entry.ext.deactivate?.();
  } catch (err) {
    console.error(`[extensions] deactivate failed: ${entry.ext.id}`, err);
  }
  // Keep the record (builtins are never cleared) but mark it inactive so
  // getExtension(id) resolves an inactive handle rather than undefined.
  deactivateExtensionRecord(entry.ext.id);
  entry.ctx = undefined;
  entry.enabled = false;
}

function safeDispose(d: { dispose: () => void }): void {
  try {
    d.dispose();
  } catch (err) {
    console.error("[extensions] dispose failed", err);
  }
}

/**
 * Register the full ordered built-in set (replacing any prior registration) and
 * activate every one not in `disabled`. All ids are pre-recorded first so a
 * built-in can resolve a handle to one that activates later (or is disabled).
 */
export function registerBuiltins(
  list: Extension[],
  disabled: ReadonlySet<string>,
): void {
  entries.clear();
  for (const ext of list) {
    entries.set(ext.id, { ext, enabled: false, reloadRequired: false });
    recordExtension(ext.id);
  }
  for (const entry of entries.values()) {
    if (disabled.has(entry.ext.id)) continue;
    try {
      activate(entry);
    } catch (err) {
      console.error(`[extensions] activate failed: ${entry.ext.id}`, err);
    }
  }
}

/** Hot-enable a disabled built-in: re-activate against a fresh context. */
export function enableBuiltin(id: string): void {
  const entry = entries.get(id);
  if (!entry || entry.enabled) return;
  activate(entry);
  void syncMenu();
}

/** Hot-disable a built-in: dispose its contributions live. */
export function disableBuiltin(id: string): void {
  const entry = entries.get(id);
  if (!entry || !entry.enabled) return;
  teardown(entry);
  void syncMenu();
}

/** Whether `id` names a registered built-in (of any tier). */
export function isBuiltin(id: string): boolean {
  return entries.has(id);
}

/**
 * Rows for the Extensions settings list: the `silo.*` built-ins only. `core.*`
 * is the immutable shell and is excluded here so it never reaches the UI.
 */
export function builtinRows(): BuiltinExtensionRow[] {
  const rows: BuiltinExtensionRow[] = [];
  for (const entry of entries.values()) {
    if (entry.ext.id.startsWith("core.")) continue;
    const m = entry.ext.manifest;
    rows.push({
      id: entry.ext.id,
      name: m?.name ?? entry.ext.id,
      description: m?.description,
      version: m?.version ?? DEFAULT_BUILTIN_VERSION,
      publisher: BUILTIN_PUBLISHER,
      builtin: true,
      enabled: entry.enabled,
      reloadRequired: entry.reloadRequired,
    });
  }
  return rows;
}

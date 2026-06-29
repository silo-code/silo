/**
 * Runtime loader for third-party extensions — loads a pre-built single-file ESM
 * bundle from disk and runs it against a real {@link ExtensionContext}, then
 * tears it down on demand.
 *
 * The bundle treats `react`, `react/jsx-runtime`, and `@silo-code/sdk` as externals
 * (see {@link installExtensionDeps}). Because the host's CSP is `null` and the
 * `minimumSystemVersion` WebKit floor predates import-map support, we don't use
 * an import map: we **rewrite the bundle's bare import specifiers** to point at
 * per-dep shim modules (blob URLs that re-export the host's live instances),
 * then `import()` the rewritten bundle as its own blob. This keeps a single
 * React + single SDK across the host↔extension boundary.
 *
 * @internal
 */
import { createContext } from "./context";
import { syncMenu } from "./menu-items";
import {
  recordExtension,
  activateExtensionRecord,
  clearExtensionRecord,
} from "./extension-registry";
import { dockPanelKindRegistry } from "./dock-panel-kinds";
import { installExtensionDeps, SHARED_DEPS } from "./extension-deps";
import { fsReadText } from "../services/tauri-fs";
import { extHostLog } from "./extension-host-logger";
import type { Extension, ExtensionContext, Permission } from "@silo-code/sdk";

/** What the loader needs to load one extension. */
export interface LoadSpec {
  /** The extension id (must match the bundle's `extension.id`). */
  id: string;
  /** Absolute path to the installed extension folder. */
  dir: string;
  /** Entry bundle path, relative to `dir` (e.g. `"dist/index.js"`). */
  main: string;
  /**
   * Capabilities the user granted this extension at install (from its manifest's
   * `silo.permissions`). Absent this they're confined to the workspace.
   */
  permissions?: readonly Permission[];
}

interface LoadedEntry {
  ctx: ExtensionContext;
  extension: Extension;
  blobUrl: string;
}

const loaded = new Map<string, LoadedEntry>();

// Ids that contributed a dock panel kind during load. A dock kind can't be
// unmounted from an already-mounted dock, so disabling/uninstalling such an
// extension needs a window reload to fully take effect — the Extensions page
// surfaces this via `needsReload`. (Kept set across unload: the stuck panel
// outlives the unload, which is exactly the condition the hint reports.)
const reloadRequiredIds = new Set<string>();

/** Whether disabling/removing `id` needs a window reload (it contributed a dock kind). */
export function needsReload(id: string): boolean {
  return reloadRequiredIds.has(id);
}

// Per-dep shim blob URLs, built once per session and shared across extensions.
let depShimUrls: Record<string, string> | null = null;

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Build a shim ESM module for a shared dep that re-exports the host's live
 * instance from `globalThis.__SILO_DEPS__`. Named exports are enumerated from
 * the actual module at runtime (so the dev-only `jsxDEV` export and the
 * named-only `@silo-code/sdk` are both handled), plus a `default` fallback so
 * `import React from "react"` works.
 */
function buildDepShim(depId: string): string {
  const mod = (globalThis.__SILO_DEPS__ ?? {})[depId] as
    | Record<string, unknown>
    | undefined;
  const keys = mod ? Object.keys(mod) : [];
  const named = keys.filter((k) => k !== "default" && IDENT_RE.test(k));
  const lines = [
    `const m = globalThis.__SILO_DEPS__[${JSON.stringify(depId)}];`,
    `export default (m && m.default !== undefined ? m.default : m);`,
  ];
  for (const k of named) {
    lines.push(`export const ${k} = m[${JSON.stringify(k)}];`);
  }
  return lines.join("\n");
}

function ensureDepShims(): Record<string, string> {
  if (depShimUrls) return depShimUrls;
  installExtensionDeps();
  const urls: Record<string, string> = {};
  for (const dep of SHARED_DEPS) {
    const blob = new Blob([buildDepShim(dep)], { type: "text/javascript" });
    urls[dep] = URL.createObjectURL(blob);
  }
  depShimUrls = urls;
  return urls;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rewrite bare external specifiers (`from "react"`, `import "@silo-code/sdk"`, …) to
 * the corresponding shim blob URLs. Anchored on the `from`/`import` keyword and
 * the exact quoted specifier, so it tolerates minified output and won't rewrite
 * an incidental `"react"` string literal elsewhere in the code. Matching the
 * full quoted token also means `"react"` never partially matches inside
 * `"react/jsx-runtime"`.
 */
function rewriteSpecifiers(
  source: string,
  shims: Record<string, string>,
): string {
  let out = source;
  for (const dep of SHARED_DEPS) {
    const spec = escapeRegExp(dep);
    const re = new RegExp(`(\\bfrom|\\bimport)(\\s*)(["'])${spec}\\3`, "g");
    out = out.replace(re, `$1$2$3${shims[dep]}$3`);
  }
  return out;
}

/**
 * Load and activate one extension. Throws on any failure (bad path, missing
 * `extension` export, id mismatch, or an `activate` that throws).
 */
export async function loadExtension(spec: LoadSpec): Promise<void> {
  if (loaded.has(spec.id)) return;

  const shims = ensureDepShims();
  const bundlePath = `${spec.dir.replace(/\/+$/, "")}/${spec.main}`;
  extHostLog.info(`Loading ${spec.id} from ${bundlePath}`);

  const source = await fsReadText(bundlePath);
  const rewritten = rewriteSpecifiers(source, shims);

  const blob = new Blob([rewritten], { type: "text/javascript" });
  const blobUrl = URL.createObjectURL(blob);

  let ctx: ExtensionContext | undefined;
  try {
    const mod = (await import(/* @vite-ignore */ blobUrl)) as {
      extension?: Extension;
      default?: Extension;
    };
    const ext = mod.extension ?? mod.default;
    if (!ext || typeof ext.activate !== "function") {
      throw new Error(
        `${spec.id}: bundle has no \`export const extension\` (or default) with an activate()`,
      );
    }
    if (ext.id !== spec.id) {
      throw new Error(
        `${spec.id}: bundle declares id "${ext.id}" — manifest and code disagree`,
      );
    }

    const dockBefore = new Set(dockPanelKindRegistry.list().map((k) => k.id));

    recordExtension(ext.id);
    ctx = createContext(ext.id, {
      trusted: false,
      permissions: spec.permissions,
      displayName: ext.manifest?.name,
    });
    const api = ext.activate(ctx);
    activateExtensionRecord(ext.id, api);

    const dockAfter = dockPanelKindRegistry.list().map((k) => k.id);
    if (dockAfter.some((id) => !dockBefore.has(id))) {
      // Dock panel kinds are read once at dock mount (WorkspaceDock) and don't
      // unmount cleanly on dispose. Tolerated for now (see plan "Known
      // limitation"); the example uses a side panel instead. Recorded so the
      // Extensions page can show a "reload to finish disabling" hint.
      reloadRequiredIds.add(ext.id);
      extHostLog.warn(
        `${ext.id} registered a dock panel kind; disabling may require a window reload`,
      );
    }

    loaded.set(spec.id, { ctx, extension: ext, blobUrl });
    extHostLog.info(`Loaded ${spec.id}`);
    void syncMenu();
  } catch (err) {
    extHostLog.error(`Load failed: ${spec.id}`, err);
    // Roll back a partial activation so a failed load leaves nothing behind.
    if (ctx)
      for (const d of [...ctx.subscriptions].reverse()) safeDispose(spec.id, d);
    clearExtensionRecord(spec.id);
    URL.revokeObjectURL(blobUrl);
    throw err;
  }
}

/** Tear down a loaded extension: dispose all its contributions and forget it. */
export function unloadExtension(id: string): void {
  const entry = loaded.get(id);
  if (!entry) return;
  extHostLog.info(`Unloading ${id}`);
  // Dispose in reverse registration order; each registry dispose removes the
  // contribution and fires onChange, so status items / settings pages / side
  // panels / commands / keybindings / menu items leave the UI reactively.
  for (const d of [...entry.ctx.subscriptions].reverse()) safeDispose(id, d);
  try {
    entry.extension.deactivate?.();
  } catch (err) {
    extHostLog.error(`Deactivate hook failed: ${id}`, err);
  }
  clearExtensionRecord(id);
  URL.revokeObjectURL(entry.blobUrl);
  loaded.delete(id);
  extHostLog.info(`Unloaded ${id}`);
  // Drop any contributed native menu items.
  void syncMenu();
}

export function isLoaded(id: string): boolean {
  return loaded.has(id);
}

function safeDispose(extensionId: string, d: { dispose: () => void }): void {
  try {
    d.dispose();
  } catch (err) {
    extHostLog.error(`Dispose failed: ${extensionId}`, err);
  }
}

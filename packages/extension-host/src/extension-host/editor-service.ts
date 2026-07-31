import { subscribe } from "valtio";
import { store } from "../state/store";
import {
  openEditor,
  openPreviewEditor,
  openUntitledEditor,
  openDiff as openDiffEditor,
  openPreviewDiff,
  findEditor,
} from "../state/workspaces";
import { contextKeys, onContextChange } from "./context-keys";
import { closeActivePanel } from "../docked/dock-api-registry";
import { registerDiffContentProvider as registerDiffContentProviderImpl } from "./diff-content-providers";
import { editorRegistry, resolveEditor } from "./editor-registry";
import { requestReveal } from "./editor-reveal";
import { EventEmitter } from "./event-emitter";
import { tabAdornmentMethodsFor } from "./tab-adornment-registry";
import type {
  Disposable,
  EditorSaveEvent,
  EditorService,
  EditorsState,
} from "@silo-code/sdk";

// `ctx.editors` — the editor & document domain. The public contract lives in
// @silo-code/sdk (editor-service.ts); this is the host implementation: opening
// files into editor tabs, the active-editor save/close commands, the
// per-editor save-handler registry, and the reactive EditorsState.

// Per-editor save handlers. Dispatch targets the active editor id (tracked via
// context keys; the dock pushes activeEditorId on active-panel changes).
const savers = new Map<string, () => void | Promise<void>>();
const saversAs = new Map<string, () => void | Promise<void>>();

// ── Per-editor document providers ────────────────────────────────────────────
// A mounted text editor registers a text/dirty provider keyed by its editorId
// (same lifecycle as save handlers). This is how the host reads the live,
// unsaved buffer for `getText`/`isDirty` without owning the Monaco instance. A
// tab whose component hasn't mounted has no provider → getText resolves
// undefined, isDirty is false — unless a dirty buffer was retained on the last
// unmount (view switch Text → Preview): then `retainedDirty` keeps the unsaved
// text readable so presenters can render it without going to disk.

interface DocumentProvider {
  getText(): string;
  isDirty(): boolean;
}

const docProviders = new Map<string, DocumentProvider>();

/** Unsaved text retained when a dirty text editor unmounts (e.g. view switch). */
const retainedDirty = new Map<string, string>();

/**
 * Register the live text/dirty provider for a mounted editor tab. Called by the
 * core text editor from its mount effect; dispose on unmount.
 *
 * @internal — reached by `core.*` editors via `@silo-code/extension-host/internal`.
 */
export function registerDocumentProvider(
  editorId: string,
  provider: DocumentProvider,
): Disposable {
  docProviders.set(editorId, provider);
  // Live provider owns the tab again — drop any handoff retained on the prior
  // unmount (Text restores from its own hot-exit backup on remount).
  retainedDirty.delete(editorId);
  return {
    dispose() {
      // Guard against a stale unmount clobbering a remounted provider.
      if (docProviders.get(editorId) !== provider) return;
      // Keep unsaved text across view switches so Preview (and getText) can
      // still read it after Monaco unmounts. Clean buffers need no retention —
      // disk is authoritative.
      if (provider.isDirty()) retainedDirty.set(editorId, provider.getText());
      else retainedDirty.delete(editorId);
      docProviders.delete(editorId);
    },
  };
}

// ── onDidSave ────────────────────────────────────────────────────────────────
// The first Event<T> in the SDK: fired after a tab's contents are written to
// disk. The core text editor calls `emitDidSave` from its save success path
// (the only place the write is confirmed and the final path — including an
// untitled buffer's newly-picked path — is known).

const saveEmitter = new EventEmitter<EditorSaveEvent>();

/**
 * Fire `ctx.editors.onDidSave`. Called by the core text editor after a
 * successful write.
 *
 * @internal — reached by `core.*` editors via `@silo-code/extension-host/internal`.
 */
export function emitDidSave(event: EditorSaveEvent): void {
  retainedDirty.delete(event.editorId);
  saveEmitter.fire(event);
}

// ── Reactive EditorsState ──────────────────────────────────────────────────

let cachedEditorsState: EditorsState | null = null;

function buildEditorsState(): EditorsState {
  const editorId = contextKeys.activeEditorId;
  const viewId = contextKeys.activeEditorViewId;
  const hydrated = store.hydrated;

  // Require a live store record to match the context key. If none is found
  // (e.g. the context key is stale after a workspace switch, before the React
  // effect cleanup runs), treat active as null rather than publishing a phantom
  // editor with wrong filePath / mode.
  let active: EditorsState["active"] = null;
  if (editorId !== null) {
    const wsId = store.activeWorkspaceId;
    const rec = wsId ? findEditor(wsId, editorId) : null;
    if (rec) {
      active = {
        editorId,
        filePath: rec.filePath ?? null,
        viewId: viewId ?? "",
        mode: rec.mode ?? "text",
      };
    }
  }

  // Referential stability: return the cached object when nothing changed so
  // useSyncExternalStore doesn't trigger spurious re-renders.
  if (
    cachedEditorsState !== null &&
    cachedEditorsState.hydrated === hydrated &&
    cachedEditorsState.active?.editorId === active?.editorId &&
    cachedEditorsState.active?.viewId === active?.viewId &&
    cachedEditorsState.active?.filePath === active?.filePath &&
    cachedEditorsState.active?.mode === active?.mode
  ) {
    return cachedEditorsState;
  }

  cachedEditorsState = { active, hydrated };
  return cachedEditorsState;
}

const editorStateListeners = new Set<(s: EditorsState) => void>();

function notifyEditorListeners(): void {
  const prev = cachedEditorsState;
  const next = buildEditorsState();
  if (next === prev) return; // nothing editor-relevant changed
  for (const l of editorStateListeners) l(next);
}

// Drive notifications from two sources: context-key changes (dock activation)
// and store changes (hydration, editor record mutations).
onContextChange(notifyEditorListeners);
subscribe(store, notifyEditorListeners);

// ── Service factory ────────────────────────────────────────────────────────

let service: EditorService | null = null;

/** @internal — host factory; extensions receive this as `ctx.editors`. */
export function getEditorService(): EditorService {
  if (service) return service;
  service = {
    open(path, opts) {
      const id = opts?.workspaceId ?? store.activeWorkspaceId;
      if (!id) return;
      const rec = opts?.preview
        ? openPreviewEditor(id, path, opts?.viewType)
        : openEditor(id, path, opts?.viewType);
      // Jump to the requested match once the view has the TARGET file's content
      // (a click can precede the content load when a not-yet-open file opens or
      // reuses the preview tab). Keyed by editor id + the file's resolved path.
      if (opts?.selection)
        requestReveal(rec.id, rec.filePath ?? path, opts.selection);
    },
    openUntitled(opts) {
      const id = opts?.workspaceId ?? store.activeWorkspaceId;
      if (id) openUntitledEditor(id);
    },
    openDiff(spec, opts) {
      const id = opts?.workspaceId ?? store.activeWorkspaceId;
      if (!id) return;
      if (opts?.preview) openPreviewDiff(id, spec);
      else openDiffEditor(id, spec);
    },
    save() {
      const id = contextKeys.activeEditorId;
      if (!id) return false;
      const fn = savers.get(id);
      if (!fn) return false;
      void fn();
      return true;
    },
    saveAs() {
      const id = contextKeys.activeEditorId;
      if (!id) return false;
      const fn = saversAs.get(id);
      if (!fn) return false;
      void fn();
      return true;
    },
    closeActive() {
      return closeActivePanel();
    },
    editorsFor(path) {
      const untitled = path === null;
      // The default the host would pick by priority (may be none if nothing
      // matches — e.g. an untitled buffer no editor claims).
      let defaultId: string | null = null;
      try {
        defaultId = resolveEditor(path, { untitled }).id;
      } catch {
        defaultId = null;
      }
      return editorRegistry
        .list()
        .filter((e) => {
          if (untitled && !e.capabilities?.handlesUntitled) return false;
          return e.match(path);
        })
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
        .map((e) => ({
          id: e.id,
          label: e.label ?? e.id,
          isDefault: e.id === defaultId,
        }));
    },
    setViewType(editorId, viewType, opts) {
      const id = opts?.workspaceId ?? store.activeWorkspaceId;
      if (!id) return;
      const rec = findEditor(id, editorId);
      if (!rec || rec.mode === "diff") return;
      if (rec.viewType === viewType) return;
      const target = editorRegistry.get(viewType);
      const name = rec.filePath ?? rec.title;
      if (!target || !target.match(name)) return;
      if (rec.filePath === null && !target.capabilities?.handlesUntitled)
        return;
      rec.viewType = viewType;
      // Re-activate so the panel remounts onto the new view (its viewerKey
      // includes viewType) and the active-editor-type context key refreshes.
      window.dispatchEvent(
        new CustomEvent("app:activate-panel", {
          detail: { panelId: `editor:${editorId}` },
        }),
      );
    },
    registerSaveHandler(editorId, handlers) {
      savers.set(editorId, handlers.save);
      if (handlers.saveAs) saversAs.set(editorId, handlers.saveAs);
      return {
        dispose() {
          savers.delete(editorId);
          saversAs.delete(editorId);
        },
      };
    },
    registerDiffContentProvider(providerId, provider) {
      return registerDiffContentProviderImpl(providerId, provider);
    },
    getText(editorId) {
      const provider = docProviders.get(editorId);
      if (provider) return Promise.resolve(provider.getText());
      // Dirty text retained across a view-switch unmount (Text → Preview).
      const retained = retainedDirty.get(editorId);
      return Promise.resolve(retained);
    },
    isDirty(editorId) {
      const provider = docProviders.get(editorId);
      if (provider) return provider.isDirty();
      return retainedDirty.has(editorId);
    },
    onDidSave: saveEmitter.event,
    getState() {
      return buildEditorsState();
    },
    subscribe(listener) {
      editorStateListeners.add(listener);
      return {
        dispose() {
          editorStateListeners.delete(listener);
        },
      };
    },
    ...tabAdornmentMethodsFor("editor"),
  };
  return service;
}

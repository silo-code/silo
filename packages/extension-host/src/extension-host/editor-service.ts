import { store } from "../state/store";
import {
  openEditor,
  openPreviewEditor,
  openUntitledEditor,
  openDiff as openDiffEditor,
  openPreviewDiff,
  findEditor,
} from "../state/workspaces";
import { contextKeys } from "./context-keys";
import { closeActivePanel } from "../docked/dock-api-registry";
import { registerDiffContentProvider as registerDiffContentProviderImpl } from "./diff-content-providers";
import { editorRegistry, resolveEditor } from "./editor-registry";
import { requestReveal } from "./editor-reveal";
import type { EditorService } from "@silo-code/sdk";

// `ctx.editors` — the editor & document domain. The public contract lives in
// @silo-code/sdk (editor-service.ts); this is the host implementation: opening
// files into editor tabs, the active-editor save/close commands, and the
// per-editor save-handler registry.

// Per-editor save handlers. Dispatch targets the active editor id (tracked via
// context keys; the dock pushes activeEditorId on active-panel changes).
const savers = new Map<string, () => void | Promise<void>>();
const saversAs = new Map<string, () => void | Promise<void>>();

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
  };
  return service;
}

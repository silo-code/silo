import type { Disposable } from "@silo-code/sdk";

// Editor "jump to a position" channel. `ctx.editors.open(path, { selection })`
// publishes a reveal request here keyed by the editor's id; the editor view
// (core.editor's TextViewer) consumes it once the *target file's content* is
// loaded into Monaco — on mount for a freshly-opened tab, after the content
// reload when the preview tab is reused, or immediately when the file is already
// open. The `path` is carried so the view never reveals against stale content
// from a previous file (a click can precede the content load). Kept here,
// host-internal, so the selection never has to be persisted on the tab record.

/** A 1-indexed range to reveal and select, from {@link OpenFileOptions.selection}. */
export interface RevealSelection {
  line: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

/** A pending reveal plus the file path it's meant for. */
export interface PendingReveal {
  /** The file the reveal targets — the view applies it only once this is loaded. */
  path: string;
  selection: RevealSelection;
}

const pending = new Map<string, PendingReveal>();
const listeners = new Set<(editorId: string) => void>();

/**
 * Request that the editor with `editorId` reveal `selection` in `path`. Stores
 * it as pending (applied when the view has that file's content) and notifies
 * live listeners (so an already-open tab re-checks immediately).
 */
export function requestReveal(
  editorId: string,
  path: string,
  selection: RevealSelection,
): void {
  pending.set(editorId, { path, selection });
  for (const l of listeners) l(editorId);
}

/** Look at the pending reveal for `editorId` without clearing it. */
export function peekPendingReveal(editorId: string): PendingReveal | undefined {
  return pending.get(editorId);
}

/** Take (and clear) the pending reveal for `editorId`. */
export function takePendingReveal(editorId: string): PendingReveal | undefined {
  const p = pending.get(editorId);
  if (p) pending.delete(editorId);
  return p;
}

/** Subscribe to reveal requests (so a mounted view re-checks its pending reveal). */
export function onRevealRequest(fn: (editorId: string) => void): Disposable {
  listeners.add(fn);
  return {
    dispose: () => {
      listeners.delete(fn);
    },
  };
}

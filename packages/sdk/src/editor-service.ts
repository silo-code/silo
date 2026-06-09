import type { Disposable } from "./types";

// `ctx.editors` — the editor & document domain (public contract). Opening files
// into editor tabs, the active-editor save/close commands, and the diff-content
// provider registry. The host implementation lives in the extension host.

/**
 * Options for the editor open methods.
 *
 * @category Consumer Services
 * @public
 */
export interface OpenFileOptions {
  /** Target workspace. Defaults to the active workspace. */
  workspaceId?: string;
  /**
   * Open as a preview tab (single-click style — replaced by the next preview,
   * italic title) instead of a permanent editor. Defaults to false.
   */
  preview?: boolean;
  /**
   * Open with a specific editor view — an {@link Editor.id}, e.g. from an
   * "Open With" menu. Persisted on the tab as {@link EditorRecord.viewType}.
   * Ignored if no registered editor with that id matches the path (the host
   * falls back to the highest-priority match). When omitted the default view is
   * used and any existing tab's view is left unchanged.
   */
  viewType?: string;
}

/**
 * One editor view that can render a given file — its id, user-facing label, and
 * whether it is the view the host would pick by default. Returned by
 * {@link EditorService.editorsFor}; used to build "Open With" menus and the
 * breadcrumb view-switcher.
 *
 * @category Consumer Services
 * @public
 */
export interface EditorViewInfo {
  /** The editor's id (an {@link Editor.id}); pass back as `viewType`. */
  id: string;
  /** Human-facing label (falls back to {@link EditorViewInfo.id}). */
  label: string;
  /** True for the editor the host resolves by default (highest priority). */
  isDefault: boolean;
}

/**
 * Save callbacks an editor viewer registers via
 * {@link EditorService.registerSaveHandler}, so the active-editor `save` /
 * `saveAs` commands can dispatch to whichever editor is focused.
 *
 * @category Consumer Services
 * @public
 */
export interface EditorSaveHandlers {
  /** Save the editor's contents. */
  save: () => void | Promise<void>;
  /** Save-as (prompt for a new path). Optional. */
  saveAs?: () => void | Promise<void>;
}

/**
 * What to open in a diff view, passed to {@link EditorService.openDiff}. The
 * diff is **generic** — it renders two contents and knows nothing about where
 * they come from. `providerId` names a {@link DiffContentProvider} (registered
 * via {@link EditorService.registerDiffContentProvider}) that resolves the two
 * sides; `args` is the serializable payload that provider needs (e.g. a git
 * revision/mode) and is persisted so the content can be recomputed on restart.
 *
 * @category Consumer Services
 * @public
 */
export interface OpenDiffSpec {
  /** The file the diff is OF — drives language detection, breadcrumb, title. */
  filePath: string;
  /** Id of the registered content provider that resolves the two sides. */
  providerId: string;
  /** Serializable args handed back to the provider to (re)compute content. */
  args?: Record<string, unknown>;
  /** Tab title. Defaults to the file's base name. */
  title?: string;
}

/** The two sides of a diff, resolved by a {@link DiffContentProvider}.
 *
 * @category Consumer Services
 * @public
 */
export interface DiffContent {
  /** Left/original side. */
  original: string;
  /** Right/modified side. */
  modified: string;
}

/**
 * The request a {@link DiffContentProvider} receives to resolve a diff's two
 * sides — the {@link OpenDiffSpec}'s `filePath`/`args` plus the folder of the
 * workspace the diff lives in (the natural cwd for path-relative providers).
 *
 * @category Consumer Services
 * @public
 */
export interface DiffContentRequest {
  /** The file the diff is OF (from {@link OpenDiffSpec.filePath}). */
  filePath: string;
  /** The provider's args (from {@link OpenDiffSpec.args}). */
  args?: Record<string, unknown>;
  /** Folder of the workspace the diff lives in, or `null` if none. */
  workspaceFolder: string | null;
}

/**
 * Resolves the two sides of a diff on demand — called by the host whenever a
 * diff panel mounts (open, tab switch, app restart), so content stays a pure
 * computed view and never has to be persisted. Register one with
 * {@link EditorService.registerDiffContentProvider}.
 *
 * @category Consumer Services
 * @public
 */
export type DiffContentProvider = (
  request: DiffContentRequest,
) => Promise<DiffContent>;

/**
 * The editor & document domain, exposed as {@link ExtensionContext.editors}.
 * Open files into editor tabs, drive the active editor (save / close), and let
 * editor viewers register save handlers. The single entry point for opening
 * editors — prefer it over reaching into workspace/editor state.
 *
 * @category Consumer Services
 * @public
 */
export interface EditorService {
  /**
   * Open a file in an editor tab. Promotes an existing preview, focuses an
   * already-open tab, or opens a new one.
   */
  open(path: string, opts?: OpenFileOptions): void;
  /** Open a fresh untitled editor. */
  openUntitled(opts?: OpenFileOptions): void;
  /**
   * Open a diff view. The content is supplied by the {@link OpenDiffSpec.providerId | provider}
   * named in `spec` — the editor itself is content-agnostic.
   */
  openDiff(spec: OpenDiffSpec, opts?: OpenFileOptions): void;
  /** Save the active editor. Returns false if there's no active saveable editor. */
  save(): boolean;
  /** Save-as the active editor. Returns false if unavailable. */
  saveAs(): boolean;
  /** Close the active dock panel. Returns false if there's nothing to close. */
  closeActive(): boolean;
  /**
   * List the editor views that match `path` (or `null` for an untitled buffer),
   * highest-priority first, each flagged whether it's the one the host resolves
   * by default. Read-only enumeration for building "Open With" menus and the
   * breadcrumb view-switcher. Returns `[]` only when nothing matches — in
   * practice never empty for a real path, since the core text editor matches
   * everything.
   */
  editorsFor(path: string | null): EditorViewInfo[];
  /**
   * Switch an already-open editor tab to a different view in place — without
   * closing and reopening it — and persist the choice on the tab. No-op if the
   * editor isn't found, `viewType` names no registered editor, or that editor
   * doesn't match the tab's file. The panel remounts onto the new view, so
   * per-instance state (scroll, selection) resets — expected, it's a different
   * presenter.
   */
  setViewType(
    editorId: string,
    viewType: string,
    opts?: { workspaceId?: string },
  ): void;
  /**
   * Register save handlers for an editor instance (by its `editorId`), so the
   * active-editor `save` / `saveAs` dispatch to it while it's focused. Dispose
   * to unregister (do this when the editor unmounts).
   */
  registerSaveHandler(
    editorId: string,
    handlers: EditorSaveHandlers,
  ): Disposable;
  /**
   * Register a {@link DiffContentProvider} under `providerId`. A diff opened
   * with that `providerId` (see {@link OpenDiffSpec}) resolves its two sides
   * through this provider, on every mount. Dispose to unregister.
   */
  registerDiffContentProvider(
    providerId: string,
    provider: DiffContentProvider,
  ): Disposable;
}

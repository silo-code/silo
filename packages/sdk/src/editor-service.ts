import type { Disposable } from "./types";
import type { Event } from "./event";
import type { EditorMode } from "./domain-types";

// `ctx.editors` — the editor & document domain (public contract). Opening files
// into editor tabs, the active-editor save/close commands, the diff-content
// provider registry, and reactive active-editor state. The host implementation
// lives in the extension host.

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
  /**
   * Reveal and select a range when the editor opens — used to jump to a search
   * match or a definition. Applied whether the tab is newly opened or already
   * open (re-jumps an existing tab). All positions are **1-indexed**; `column`
   * defaults to 1, and an omitted `endLine`/`endColumn` collapses the selection
   * to a caret (just scrolls the line into view). Best-effort: editor views that
   * can't honor a selection ignore it.
   */
  selection?: {
    /** 1-indexed start line. */
    line: number;
    /** 1-indexed start column. Defaults to 1. */
    column?: number;
    /** 1-indexed end line. Defaults to `line`. */
    endLine?: number;
    /** 1-indexed end column. Defaults to `column`. */
    endColumn?: number;
  };
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
 * Save callbacks an editor registers via
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
 * sides — the {@link OpenDiffSpec}'s `filePath`/`args` plus the workspace
 * folder that contains that file (the natural cwd for path-relative providers).
 * In a multi-root workspace this is the matching root (primary or an
 * `extraFolder` such as an opened git worktree), not always the primary folder.
 *
 * @category Consumer Services
 * @public
 */
export interface DiffContentRequest {
  /** The file the diff is OF (from {@link OpenDiffSpec.filePath}). */
  filePath: string;
  /** The provider's args (from {@link OpenDiffSpec.args}). */
  args?: Record<string, unknown>;
  /**
   * Workspace root that contains {@link DiffContentRequest.filePath}, or
   * `null` if none. Prefer this over the workspace primary folder when roots
   * differ (e.g. a linked worktree opened alongside).
   */
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
 * A point-in-time snapshot of the focused editor tab. Part of
 * {@link EditorsState}, returned by {@link EditorService.getState} and
 * delivered to {@link EditorService.subscribe} listeners.
 *
 * @category Consumer Services
 * @public
 */
export interface ActiveEditorInfo {
  /** The focused editor tab's record id — matches {@link EditorRecord.id}. */
  editorId: string;
  /**
   * The absolute file path of the focused tab, or `null` for an untitled
   * buffer.
   */
  filePath: string | null;
  /**
   * The {@link Editor.id} of the presenter rendering the tab
   * (e.g. `"core.text-editor"`, `"silo.markdown-preview"`). Empty string
   * when the presenter could not be resolved (rare: editor registered after
   * the tab was opened).
   */
  viewId: string;
  /** Whether the tab is in text or diff mode. */
  mode: EditorMode;
}

/**
 * A frozen, referentially-stable snapshot of editor domain state. Returned by
 * {@link EditorService.getState} and delivered to
 * {@link EditorService.subscribe} listeners.
 *
 * Compatible with `useServiceState` — just pass `ctx.editors` directly.
 *
 * @category Consumer Services
 * @public
 */
export interface EditorsState {
  /**
   * The focused editor tab, or `null` when the active dock panel is not an
   * editor tab (e.g. a terminal, a dock panel kind, or nothing at all).
   */
  active: ActiveEditorInfo | null;
  /**
   * `true` once the persisted workspace state has loaded from disk. Matches
   * `WorkspaceState.hydrated` — guard state-restoring code on this flag.
   */
  hydrated: boolean;
}

/**
 * Payload delivered to {@link EditorService.onDidSave} listeners after an
 * editor tab's contents are written to disk.
 *
 * @category Consumer Services
 * @public
 */
export interface EditorSaveEvent {
  /** The saved tab's editor record id — matches {@link EditorRecord.id}. */
  editorId: string;
  /**
   * Absolute path the contents were written to. For a save-as (or first save
   * of an untitled buffer) this is the newly chosen path, not the old one.
   */
  filePath: string;
}

/**
 * The editor & document domain, exposed as {@link ExtensionContext.editors}.
 * Open files into editor tabs, drive the active editor (save / close), and let
 * editors register save handlers. The single entry point for opening editors —
 * prefer it over reaching into workspace/editor state.
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
  /**
   * The current buffer text of an open editor tab, including unsaved edits.
   *
   * Resolves `undefined` when the tab isn't text-backed (e.g. the image
   * viewer), has never mounted a text document, and has no retained unsaved
   * buffer. A dirty text editor that unmounts on a view switch (e.g. Text →
   * Markdown Preview) retains its buffer so presenters can still read it. A
   * lazy-mounted dock panel is **not** force-mounted to read its text. It is
   * async precisely because the live text lives in the mounted editor
   * component, not in host state.
   *
   * @example
   * ```ts
   * const text = await ctx.editors.getText(editorId);
   * if (text !== undefined) ctx.log.info(`${text.length} chars`);
   * ```
   */
  getText(editorId: string): Promise<string | undefined>;
  /**
   * Whether an open editor tab has unsaved changes. Returns `false` for an
   * unknown id or a tab that isn't text-backed and has no retained dirty
   * buffer. Stays `true` across a dirty Text → Preview view switch.
   */
  isDirty(editorId: string): boolean;
  /**
   * Fires after an editor tab's contents are saved to disk — a formatter,
   * linter, or build-on-save extension's entry point. See {@link Event}.
   *
   * @example
   * ```ts
   * ctx.subscriptions.push(
   *   ctx.editors.onDidSave(({ editorId, filePath }) => {
   *     ctx.log.info(`saved ${filePath}`);
   *   }),
   * );
   * ```
   */
  onDidSave: Event<EditorSaveEvent>;
  /**
   * Current frozen snapshot of editor state. The returned object is
   * referentially stable between renders — `getState() === getState()` when
   * nothing has changed, which satisfies `useSyncExternalStore`'s contract and
   * means `useServiceState(ctx.editors)` works without extra memoization.
   *
   * @example
   * ```ts
   * const { active } = ctx.editors.getState();
   * if (active) ctx.log.info(`Active file: ${active.filePath ?? "(untitled)"}`);
   * ```
   */
  getState(): EditorsState;
  /**
   * Subscribe to changes in the active editor. The listener is called whenever
   * `active` changes (tab focus moves, workspace switches, editor opens or
   * closes) or `hydrated` flips. Returns a {@link Disposable} that cancels the
   * subscription.
   *
   * Use `useServiceState(ctx.editors)` in React components instead of calling
   * `subscribe` directly — it wraps `getState` + `subscribe` for you.
   *
   * @example
   * ```ts
   * ctx.subscriptions.push(
   *   ctx.editors.subscribe(({ active }) => {
   *     statusItem.setTitle(active?.filePath ?? "No file");
   *   }),
   * );
   * ```
   */
  subscribe(listener: (state: EditorsState) => void): Disposable;
}

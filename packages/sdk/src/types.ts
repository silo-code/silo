/**
 * The Silo extension API — types only.
 *
 * Everything an extension author can see at compile time lives here (plus the
 * service interfaces in the sibling `*-service` files, which this module
 * references). The host injects the runtime implementation at activation time
 * via {@link ExtensionContext}; extensions compile *against* these types and
 * never import the host. This is the VS Code (`vscode.d.ts`) / Obsidian
 * (`obsidian-api`) model.
 *
 * Start with {@link Extension} (the unit you export) and
 * {@link ExtensionContext} (the `ctx` the host hands you).
 *
 * @remarks Every symbol exported here is part of the public, permanently
 * supported surface. Keep it minimal and deliberate — each addition is a
 * forever breaking-change liability.
 *
 * @packageDocumentation
 */
import type React from "react";
import type { IDockviewPanelProps } from "dockview";
import type { ContextKeys } from "./context-keys";
import type { WorkspaceService } from "./workspace-service";
import type { EditorService } from "./editor-service";
import type { LayoutService } from "./layout-service";
import type { ProcessService } from "./process-service";
import type { TerminalService } from "./terminal-service";
import type { FileService } from "./file-service";
import type { SearchService } from "./search-service";
import type { ThemeService, ThemePreset } from "./theme-service";
import type { DndService } from "./dnd-service";
import type { UiService } from "./ui-service";
import type { NetworkService } from "./network-service";
import type { ExtensionStorage } from "./extension-storage";

/**
 * The teardown handle returned by every `register*` call on
 * {@link ExtensionContext}. Calling {@link Disposable.dispose | dispose}
 * removes the contribution. Disposables are also collected on
 * {@link ExtensionContext.subscriptions} so the host can tear an extension
 * down wholesale.
 *
 * @category Core Types
 * @public
 */
export interface Disposable {
  dispose(): void;
}

/**
 * The dockview panel API handed to a {@link DockPanelKind} component — used to
 * drive the panel's own tab (title, close, focus). Re-exported from `dockview`
 * so extensions don't take a direct dependency on it.
 *
 * @category Core Types
 * @public
 */
export type DockPanelApi = IDockviewPanelProps["api"];

/**
 * Props handed to a {@link DockPanelKind} component. Use this type to annotate
 * your component instead of importing `IDockviewPanelProps` from `dockview`
 * directly — the SDK wraps it so extensions remain insulated from dockview
 * version changes. The optional generic `T` narrows the shape of `params`.
 *
 * @category Core Types
 * @public
 */
export type DockPanelProps<T extends object = Record<string, unknown>> =
  IDockviewPanelProps<T>;

/**
 * Props passed to an {@link Editor} component. An editor renders the contents of
 * one editor tab (a presenter for a file type — distinct from
 * {@link ExtensionContext.editors}, which is the document model).
 *
 * @category Registration
 * @public
 */
export interface EditorProps {
  /** Stable id of the editor tab this editor instance is rendering. */
  editorId: string;
  /** Absolute path of the file, or `null` for an untitled buffer. */
  filePath: string | null;
  /** Handle to the surrounding dock panel (title, close, focus). */
  dockApi: DockPanelApi;
}

/**
 * Optional declarations about what an {@link Editor} can do, used by the host to
 * decide routing (e.g. whether the editor can own an untitled buffer).
 *
 * @category Registration
 * @public
 */
export interface EditorCapabilities {
  /**
   * The editor only displays, it can't edit or save (e.g. the image viewer, a
   * future PDF/hex preview). Defaults to false — editors are editable unless
   * they opt out. Mirrors VS Code's read-only custom-editor variant.
   */
  readonly?: boolean;
  /** The editor can render a never-saved (untitled) buffer. Defaults to false. */
  handlesUntitled?: boolean;
}

/**
 * Contributes a presenter for a file type — everything that opens in the editor
 * area is an `Editor` (a read-write text editor, a read-only image viewer, …).
 * The host picks one per file by calling each registered editor's
 * {@link Editor.match} (highest {@link Editor.priority} wins) and mounting its
 * {@link Editor.component}. Registered via
 * {@link ExtensionContext.registerEditor}; not to be confused with
 * {@link ExtensionContext.editors} (the document/tab model).
 *
 * @category Registration
 * @public
 */
export interface Editor {
  /** Unique id, conventionally namespaced (e.g. `"core.text-editor"`). */
  id: string;
  /**
   * Human-facing name of this *view* of a file, e.g. `"Text"` or `"Preview"`.
   * Surfaces in the breadcrumb view-switcher and the explorer "Open With" menu
   * when more than one editor matches a file. Defaults to {@link Editor.id}
   * where a label is needed but none is given.
   */
  label?: string;
  /** Returns true if this editor should handle the given path (`null` = untitled). */
  match: (path: string | null) => boolean;
  /** The React component rendered for matched tabs. */
  component: React.ComponentType<EditorProps>;
  /**
   * Higher wins when multiple editors match the same file. Defaults to 0. On a
   * tie the first-registered editor wins — so a second editor for a type can
   * deliberately be an *alternate* (not the default) by matching the
   * incumbent's priority rather than exceeding it. Users still pick any matching
   * view per-tab via "Open With" / the view-switcher
   * ({@link OpenFileOptions.viewType}).
   */
  priority?: number;
  /** Optional routing hints — see {@link EditorCapabilities}. */
  capabilities?: EditorCapabilities;
}

/**
 * Describes how to bootstrap a new, never-saved buffer for a file type. Its
 * mere presence on a FileType marks the type as creatable — it shows up in the
 * "New File" surfaces (the tab-group + menu, the empty-workspace watermark).
 *
 * @category Registration
 * @public
 */
export interface NewFileTemplate {
  /** Base name (no extension) for the untitled buffer. Defaults to "Untitled". */
  defaultName?: string;
}

/**
 * Declarative metadata about a file extension — the open-ended counterpart to
 * Viewer (which is purely a renderer). A single source of truth that "New File"
 * surfaces (and, later, tab/explorer icons) can enumerate. Registering a
 * FileType does not register a viewer; the two are matched independently by
 * extension at dispatch time.
 *
 * @category Registration
 * @public
 */
export interface FileType {
  /** Unique id, conventionally namespaced. */
  id: string;
  /** Human label, e.g. "Foo File". Used to build "New {label}…" entries. */
  label: string;
  /** Extensions this type owns — leading dot, lowercase. e.g. [".foo"]. */
  extensions: string[];
  /** When present, the type can be created from "New File" surfaces. */
  newFile?: NewFileTemplate;
}

/**
 * A named, invokable action. Register with
 * {@link ExtensionContext.registerCommand} and trigger from menu items,
 * keybindings, status items, or {@link ExtensionContext.executeCommand}.
 *
 * @category Registration
 * @public
 */
export interface Command {
  /** Unique id, conventionally `area.verb` (e.g. `"view.toggleLeftPanel"`). */
  id: string;
  /** Human-readable label (shown where the command surfaces in UI). */
  label: string;
  /** The action. Runs synchronously; do async work inside if needed. */
  run: () => void;
}

/**
 * The top-level application menus a {@link MenuItemContribution} can target.
 *
 * @category Registration
 * @public
 */
export type MenuId = "file" | "edit" | "view" | "window";

/**
 * Places a command into one of the application menus.
 *
 * @category Registration
 * @public
 */
export interface MenuItemContribution {
  /** Unique id for this menu entry. */
  id: string;
  /** Which application menu to place the item in. */
  menu: MenuId;
  /** Id of the {@link Command} this item invokes. */
  command: string;
  /** Override label; defaults to the command's label. */
  label?: string;
  /** Accelerator shown next to the item (display only; bind via {@link Keybinding}). */
  accelerator?: string;
  /**
   * Group key used to bucket items in the same submenu. Items in different
   * groups are visually separated by a separator. Group names are sorted
   * lexically — convention is to prefix with a digit ("1_new", "2_save").
   * Defaults to "9_default" so unspecified items land at the bottom.
   */
  group?: string;
  /** Sort order within a group. Defaults to 0. */
  order?: number;
  /**
   * Optional predicate against current context keys. Items whose `when`
   * returns false stay visible in the app menu but are disabled (macOS
   * native pattern — items can't appear/disappear without rebuilding the
   * whole menu). Items without `when` are always enabled.
   */
  when?: (ctx: ContextKeys) => boolean;
}

/**
 * Binds a keyboard shortcut to a {@link Command}.
 *
 * @category Registration
 * @public
 */
export interface Keybinding {
  /** Unique id for this binding. */
  id: string;
  /**
   * Shortcut spec like "cmd+s", "ctrl+shift+s", "cmd+1", "cmd+shift+=".
   * Parsed against KeyboardEvent.code for layout-stable letter/digit keys
   * plus a small alias table for symbol keys (= → Equal, - → Minus, etc.).
   */
  key: string;
  /** Id of the {@link Command} to invoke. */
  command: string;
  /** Optional predicate against context keys; the binding is inert when false. */
  when?: (ctx: ContextKeys) => boolean;
}

/**
 * Props passed to a {@link SidePanel} component.
 *
 * @category Registration
 * @public
 */
export interface SidePanelProps {
  /** True when this side panel is currently visible / selected in its column. */
  active: boolean;
  /**
   * Namespaced, persisted key/value storage scoped to this panel id. Use for
   * **panel-local UI state** — scroll positions, selections, expanded sections,
   * etc. — across reloads. For extension-level settings shared across surfaces,
   * use {@link ExtensionContext.storage} instead.
   */
  storage: ExtensionStorage;
  /**
   * True once the persisted app state has finished loading from disk.
   * Panels should defer restoring values from `storage` until this is true
   * (or subscribe to `storage` and re-read when it flips).
   */
  hydrated: boolean;
}

/**
 * A panel mounted in the left or right side column (e.g. file explorer, git).
 *
 * @category Registration
 * @public
 */
export interface SidePanel {
  /** Unique id, conventionally namespaced. */
  id: string;
  /** Which side column to mount in. */
  location: "left" | "right";
  /** Title shown in the column's panel switcher. */
  title: string;
  /** The React component; receives {@link SidePanelProps}. */
  component: React.ComponentType<SidePanelProps>;
  /** Sort order within the side column. Defaults to 0. */
  order?: number;
  /**
   * If true, defer mounting the component until the first time this panel
   * becomes active. Once mounted, stays mounted (panel can use `active`
   * to pause expensive work when hidden).
   */
  lazyMount?: boolean;
}

/**
 * Registers a kind of dock panel (a tab that can live in the center dock area,
 * e.g. the terminal). Workspaces open panels of registered kinds by id.
 *
 * @category Registration
 * @public
 */
export interface DockPanelKind {
  /** Unique id for this panel kind. */
  id: string;
  /** The React component; receives the raw dockview panel props. */
  component: React.ComponentType<IDockviewPanelProps>;
  /**
   * When set, this kind appears as an entry in the center dock's **+** add
   * menu (the per-group header button). Omit to keep the kind internal.
   */
  addMenuItem?: {
    /** Label shown in the menu, e.g. `"New Web Viewer"`. */
    label: string;
    /** Optional icon rendered to the left of the label. */
    icon?: React.ReactNode;
    /**
     * Params forwarded to the new panel instance. Merged with a generated
     * panel id — include `title` here to control the tab label.
     */
    params?: Record<string, unknown>;
  };
}

/**
 * A widget in the status bar (the strip along the bottom of the window).
 *
 * @remarks
 * The status bar container sets `font-size` and `color` on itself, so
 * components rendered inside it inherit the correct values automatically —
 * **do not override `font-size` or `font-family`** in status item CSS unless
 * you have a deliberate reason to deviate. You may override `color` using
 * design tokens (e.g. `--silo-color-text-lo` for a label / `--silo-color-text`
 * for a value) to create visual distinctions within an item.
 *
 * @category Registration
 * @public
 */
export interface StatusItem {
  /** Unique id for this status item. */
  id: string;
  /** Which end of the status bar this item sits at. */
  alignment: "left" | "right";
  /** Sort order within its alignment group. Lower sorts first. Defaults to 0. */
  priority?: number;
  /**
   * Tooltip shown on hover over the entire status item. The host renders a
   * custom-styled popup (not the browser's native `title` tooltip). For items
   * that need per-button or reactive tooltips, omit this and manage tooltips
   * inside the component instead (core extensions use `<Tooltip>` from the
   * internal barrel; external extensions may use the native `title` attribute).
   */
  tooltip?: string;
  /** The React component (renders its own content; no props). */
  component: React.ComponentType;
}

/**
 * A page in the Settings dialog, listed in the left rail.
 *
 * @category Registration
 * @public
 */
export interface SettingsPage {
  /** Unique id for this settings page. */
  id: string;
  /** Label shown in the Settings left rail. */
  title: string;
  /**
   * Optional grouping key for the left rail (groups sorted lexically, separated
   * by a divider). Honored only for `core.*` pages; a page contributed by any
   * non-core extension is always grouped under **Extensions**, so `group` is
   * ignored for those.
   */
  group?: string;
  /** Sort order within the group. Lower sorts first. Defaults to 0. */
  order?: number;
  /** Renders the right-hand pane when this page is selected. */
  component: React.ComponentType;
}

/**
 * The object handed to {@link Extension.activate}. It is the *only* sanctioned
 * way an extension touches the running app: register contributions, invoke
 * commands, and read/drive state through the typed consumer services. Every
 * `register*` call returns a {@link Disposable} and is also tracked on
 * {@link ExtensionContext.subscriptions}.
 *
 * @category Extension Contract
 * @public
 */
export interface ExtensionContext {
  /** The activating extension's id (its {@link Extension.id}). */
  readonly extensionId: string;
  /** Disposables tracked for this extension; the host disposes them on teardown. */
  readonly subscriptions: Disposable[];
  /**
   * Namespaced, persisted key/value storage scoped to this extension's id.
   * Unlike {@link SidePanelProps.storage} (panel-local UI state), this is the
   * extension's own bag, shared across all its surfaces — status bar, side
   * panels, and settings page. It is global, not per-workspace, for now.
   *
   * Safe to call `.get()` / `.set()` immediately in {@link Extension.activate} —
   * there is no need to wait for a panel to mount.
   */
  readonly storage: ExtensionStorage;
  /** Register an {@link Editor} (a presenter for a file type's editor tab). */
  registerEditor(editor: Editor): Disposable;
  /** Register a {@link FileType} (declarative file metadata). */
  registerFileType(type: FileType): Disposable;
  /** Register a {@link Command} (a named, invokable action). */
  registerCommand(cmd: Command): Disposable;
  /** Register a {@link MenuItemContribution} (place a command in a menu). */
  registerMenuItem(item: MenuItemContribution): Disposable;
  /** Register a {@link Keybinding} (bind a shortcut to a command). */
  registerKeybinding(binding: Keybinding): Disposable;
  /** Register a {@link SidePanel} (a left/right column panel). */
  registerSidePanel(panel: SidePanel): Disposable;
  /** Register a {@link DockPanelKind} (a center-dock tab kind). */
  registerDockPanelKind(kind: DockPanelKind): Disposable;
  /** Register a {@link StatusItem} (a status-bar widget). */
  registerStatusItem(item: StatusItem): Disposable;
  /** Register a {@link SettingsPage} (a page in the Settings dialog). */
  registerSettingsPage(page: SettingsPage): Disposable;
  /** Register a {@link ThemePreset} (a selectable theme in the picker). */
  registerThemePreset(preset: ThemePreset): Disposable;
  /**
   * Invoke a registered command by id — including commands contributed by
   * other extensions. The minimal "operate" primitive; pairs with the typed
   * services for read access.
   */
  executeCommand(id: string): void;
  /**
   * Consumer API for driving workspace state — create, rename, reorder,
   * activate, soft close/reopen, and hard delete. Subscribe to a frozen
   * state for read access without depending on Valtio.
   */
  readonly workspaces: WorkspaceService;
  /**
   * The editor & document domain — open files into editor tabs, drive the
   * active editor (save / close), and register editor save handlers. Opening
   * editors lives here, not on {@link ExtensionContext.workspaces}.
   */
  readonly editors: EditorService;
  /**
   * Consumer API for app layout — side-panel collapse state. Read via
   * getState/useServiceState/subscribe; drive via toggleSidePanel /
   * setSidePanelCollapsed.
   */
  readonly layout: LayoutService;
  /**
   * Persistent process / PTY sessions that **survive app restarts** — the core
   * primitive under the terminal (and future task runners, REPLs). Spawn or
   * re-attach a session and drive it via the returned `ProcessSession`.
   */
  readonly process: ProcessService;
  /**
   * Consumer API for the terminal domain — open a terminal tab in a workspace
   * (`create`) or reap a workspace's terminals (`closeWorkspace`). The terminal
   * is a core feature (a built-in DockKind like the editor); its tabs render
   * from the workspace's records, and PTY sessions live on
   * {@link ExtensionContext.process}.
   */
  readonly terminals: TerminalService;
  /**
   * Host-mediated filesystem access — read / write / list / watch, all routed
   * through the host rather than raw Tauri. The single privileged chokepoint
   * for the filesystem; watcher lifecycle is host-owned (see {@link FileService}).
   */
  readonly files: FileService;
  /**
   * Cross-file content search over the workspace — the core primitive under the
   * Search panel (and future quick-open / find-references). Runs a native search
   * engine in the host (off the UI thread), honoring `.gitignore`, and resolves
   * with matches grouped by file. See {@link SearchService}.
   */
  readonly search: SearchService;
  /**
   * Consumer API for the theme domain — read the merged preset set + active
   * theme, switch themes, and manage custom themes. Read via getState /
   * subscribe; contribute a new preset via
   * {@link ExtensionContext.registerThemePreset}.
   */
  readonly theme: ThemeService;
  /**
   * Drag-and-drop — be a drag source ({@link DndService.beginDrag}) and a drop
   * target ({@link DndService.registerDropTarget}), with typed payloads
   * ({@link DND_MIME}) that interoperate across extensions. The host owns the
   * drag affordance and the modifier-mode resolution.
   */
  readonly dnd: DndService;
  /**
   * User-interaction — the only sanctioned way to talk to the user (the host
   * renders the chrome). Native file/folder pickers ({@link UiService.pickFolder},
   * {@link UiService.pickFile}, {@link UiService.savePath}) and transient toast
   * notifications ({@link UiService.notify}). Mirrors VS Code's `window.show*`.
   */
  readonly ui: UiService;
  /**
   * Server-side HTTP client — makes requests from the Rust backend, bypassing
   * the browser's CORS policy. Use when browser `fetch` is insufficient:
   * reading response headers from cross-origin requests, probing localhost
   * services without CORS headers, or checking iframe embeddability before
   * loading a URL. See {@link NetworkService} for the full API.
   */
  readonly net: NetworkService;
  /**
   * Resolve a handle to another extension in order to consume the API it
   * published (the value its {@link Extension.activate} returned). This is how
   * features that live *outside* core — git, terminal, themes — expose
   * capabilities to other extensions.
   *
   * Returns `undefined` if no extension with that id is known. Even when known,
   * the handle's {@link ExtensionHandle.api | api} is `undefined` until that
   * extension has activated — so **always handle absence**; the provider may be
   * disabled or activate after you. Call this at use time, not in `activate`.
   *
   * @typeParam API - the provider's published API type (import its types package).
   */
  getExtension<API = unknown>(id: string): ExtensionHandle<API> | undefined;
}

/**
 * A handle to another extension, obtained via
 * {@link ExtensionContext.getExtension}. Lets one extension consume another's
 * published API while tolerating its absence.
 *
 * @category Extension Contract
 * @public
 */
export interface ExtensionHandle<API = unknown> {
  /** The resolved extension's id. */
  readonly id: string;
  /** True once that extension has activated. */
  readonly active: boolean;
  /** Its published API (what its `activate` returned), or `undefined` if it
   * hasn't activated or published nothing. */
  readonly api: API | undefined;
}

/**
 * Display metadata for an extension, surfaced in the **Extensions** settings
 * page (name, one-line description, version, and {@link ExtensionManifest.publisher
 * | publisher} brand). For built-in extensions this is declared in-code on the
 * {@link Extension}; for runtime-loaded third-party extensions the host reads
 * the equivalent fields from the package manifest (`displayName`/`description`/
 * `version` and the `silo.publisher` key) instead. Every field is optional — the
 * host falls back to the extension {@link Extension.id | id} (and the id's
 * namespace for the publisher) when one is absent.
 *
 * @category Extension Contract
 * @public
 */
export interface ExtensionManifest {
  /** Human-friendly name shown in the Extensions list (falls back to the id). */
  readonly name?: string;
  /** One-line description shown beneath the name. */
  readonly description?: string;
  /** Version string shown next to the name. */
  readonly version?: string;
  /**
   * The publisher/brand shown beside the name (e.g. `"Silo"`). Built-in
   * extensions are always branded `"Silo"` by the host regardless of this field;
   * third-party extensions set it via the `silo.publisher` manifest key and fall
   * back to their id's namespace (e.g. `"acme"` for `"acme.foo"`).
   */
  readonly publisher?: string;
}

/**
 * The shape of a Silo extension: a stable id plus an
 * {@link Extension.activate | activate} function the host calls once, passing
 * the {@link ExtensionContext}. This is the unit the host loads — built-ins
 * today, external packages later.
 *
 * @typeParam API - the type of the API this extension publishes, if any (the
 * return type of {@link Extension.activate}). Defaults to `unknown`; omit it for
 * extensions that publish nothing.
 *
 * @category Extension Contract
 * @public
 */
export interface Extension<API = unknown> {
  /**
   * Unique extension id, conventionally namespaced: `core.*` for Silo's core
   * feature set, `silo.*` for its optional bundled features, `<vendor>.*` for
   * third parties (e.g. `"core.editor"`, `"silo.git"`, `"acme.foo"`).
   */
  id: string;
  /**
   * Optional display metadata for the **Extensions** settings page. Built-in
   * extensions declare it here so they can be listed (and disabled) with a name
   * and description; third-party extensions supply the equivalent through their
   * package manifest instead. See {@link ExtensionManifest}.
   */
  manifest?: ExtensionManifest;
  /**
   * Called once by the host; register contributions against `ctx` here.
   * **Optionally return an API object** to publish it for other extensions to
   * consume via {@link ExtensionContext.getExtension}. Return nothing if the
   * extension publishes no API.
   */
  activate(ctx: ExtensionContext): API | void;
  /** Optional cleanup hook (reserved for dynamic load/unload). */
  deactivate?(): void;
}

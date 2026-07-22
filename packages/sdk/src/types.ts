/**
 * The Silo extension API — types-first contract plus a small set of blessed
 * runtime helpers.
 *
 * Everything an extension author can see at compile time lives here (plus the
 * service interfaces in the sibling `*-service` files, which this module
 * references). The host injects the runtime implementation at activation time
 * via {@link ExtensionContext}; extensions compile *against* these types and
 * never import the host. This is the VS Code (`vscode.d.ts`) / Obsidian
 * (`obsidian-api`) model.
 *
 * **Runtime exports:** the SDK also ships a small set of blessed runtime
 * helpers (`Tooltip`, `useFocusGroup`, `useServiceState`, `DND_MIME`,
 * `PathDeniedError`, `NetworkError`) and peer-depends on React 19. Changes to
 * these can be breaking even when the types are unchanged — treat them with
 * the same care as the type surface.
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
import type { ContextKeys } from "./context-keys";
import type { Workspace } from "./domain-types";
import type { WorkspaceService } from "./workspace-service";
import type { EditorService } from "./editor-service";
import type { LayoutService } from "./layout-service";
import type { ProcessService } from "./process-service";
import type { ProcessesService } from "./processes-service";
import type { TerminalService } from "./terminal-service";
import type { FileService } from "./file-service";
import type { SearchService } from "./search-service";
import type { ThemeService, ThemePreset } from "./theme-service";
import type { DndService } from "./dnd-service";
import type { UiService } from "./ui-service";
import type { NetworkService } from "./network-service";
import type { WebviewService } from "./webview-service";
import type { SystemService } from "./system-service";
import type { LogService } from "./output-service";
import type {
  ExtensionStorage,
  ExtensionStorageScopes,
} from "./extension-storage";

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
 * The panel API handed to a {@link DockPanelKind} component. Use these methods
 * to drive the panel's own tab (title, close, focus) and update its stored
 * parameters. The host provides the implementation; extensions never construct
 * this object directly.
 *
 * @category Core Types
 * @public
 */
export interface DockPanelApi {
  /** Update the title shown in the panel's tab. */
  setTitle(title: string): void;
  /** Programmatically close this panel. */
  close(): void;
  /** Bring this panel to focus (make it the active panel in its group). */
  setActive(): void;
  /** `true` while this panel is the active one in its dock group. */
  readonly isActive: boolean;
  /**
   * Subscribe to active-state transitions. The listener is called whenever
   * the panel gains or loses active status, with an event carrying the new
   * state. Returns a {@link Disposable} that cancels the subscription.
   */
  onDidActiveChange(
    listener: (event: { readonly isActive: boolean }) => void,
  ): Disposable;
  /**
   * `true` while this panel is visible — its tab is the selected one in its
   * group. Distinct from {@link DockPanelApi.isActive | isActive}: with split
   * groups, every group's selected tab is visible but only one panel in the
   * whole dock is active.
   */
  readonly isVisible: boolean;
  /**
   * Subscribe to visibility transitions (the panel's tab being selected or
   * deselected in its group). Use to pause expensive work while hidden, or to
   * re-measure on reveal (e.g. the terminal refits xterm when its tab becomes
   * visible again). Returns a {@link Disposable} that cancels the subscription.
   */
  onDidVisibilityChange(
    listener: (event: { readonly isVisible: boolean }) => void,
  ): Disposable;
  /**
   * Shallow-merge `params` into this panel's stored parameters. Keys absent
   * from `params` are left unchanged. Useful for keeping tabs-serializable
   * state (e.g. the open URL in a web-viewer panel) consistent with the UI.
   */
  updateParameters(params: object): void;
}

/**
 * Props handed to a {@link DockPanelKind} component. Use this type to annotate
 * your component instead of importing from the underlying dock framework
 * directly — the SDK owns this surface so extensions remain insulated from
 * host implementation details. The optional generic `T` narrows `params`.
 *
 * @category Core Types
 * @public
 */
export interface DockPanelProps<T extends object = Record<string, unknown>> {
  /** The panel API — drives the tab (title, close, focus, params). */
  api: DockPanelApi;
  /** Serializable parameters forwarded to the panel at open time. */
  params: T;
}

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
 * {@link Editor} (which is purely a presenter/renderer). A single source of
 * truth that "New File" surfaces (and, later, tab/explorer icons) can
 * enumerate. Registering a FileType does not register an Editor; the two are
 * matched independently by extension at dispatch time.
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
  /**
   * The action. May accept arguments passed through from
   * {@link ExtensionContext.executeCommand} and may return a value (sync or
   * async); `executeCommand` resolves with whatever this returns.
   *
   * Zero-argument, void-returning commands are still valid — `() => void`
   * satisfies this type, so existing registrations compile unchanged.
   */
  run: (...args: unknown[]) => unknown | Promise<unknown>;
}

/**
 * The top-level application menus a {@link MenuItemContribution} can target.
 * `"help"` is present on all platforms; `"file"`, `"edit"`, `"view"`, and
 * `"window"` are the remaining standard menus.
 *
 * @category Registration
 * @public
 */
export type MenuId = "file" | "edit" | "view" | "window" | "help";

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
  /**
   * Sort order within a group. Defaults to 0.
   *
   * **Convention:** built-in (core) items use negative values; extensions
   * should use `0` or greater so they appear after built-in items within
   * the same group by default.
   */
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
 * The context menus of built-in surfaces that a
 * {@link ContextMenuContribution} can target — distinct from the menubar
 * {@link MenuId}, because context items receive a **target argument** (which
 * file, which editor, which workspace) that menubar items never have.
 *
 * Each surface's target type is declared by {@link MenuContext}.
 *
 * @category Registration
 * @public
 */
export type MenuSurface =
  | "explorer/item" // right-click on a file/folder in the file explorer
  | "editor/tab" // right-click on an editor tab
  | "terminal/tab" // right-click on a terminal tab
  | "terminal/link" // right-click landing directly on a link inside a terminal
  | "workspace"; // right-click on a workspace row in the Workspaces panel

/**
 * The typed **context object** each {@link MenuSurface} passes to an invoked
 * command (as its first argument) and to the contribution's
 * {@link ContextMenuContribution.when | when} /
 * {@link ContextMenuContribution.checked | checked} predicates. The contract
 * is per-surface and closed: a flat, serializable object — never a DOM event
 * or host component internals.
 *
 * The `"workspace"` surface is unique in passing the full {@link Workspace}
 * rather than a lightweight derived object — workspace actions typically need
 * the workspace's metadata (id, folder, name) wholesale.
 *
 * @category Registration
 * @public
 */
export interface MenuContext {
  "explorer/item": { path: string; isDir: boolean; workspaceId: string };
  "editor/tab": { editorId: string; filePath: string | null; viewId: string };
  "terminal/tab": { terminalId: string; workspaceId: string };
  /**
   * The right-clicked link's kind (`"url"` for OSC-8/`WebLinksAddon`-detected
   * links, `"path"` for Silo's own file-path provider) and its literal text
   * (the URL or path string), alongside which terminal it was found in. See
   * {@link https://github.com/silo-code/silo/blob/main/docs/decisions/0027-terminal-link-policy.md | ADR 0027}
   * for the shared link contract this surface hooks into.
   */
  "terminal/link": { terminalId: string; kind: "url" | "path"; text: string };
  workspace: Workspace;
}

/**
 * Adds a command to the right-click context menu of a built-in surface.
 * Register via {@link ExtensionContext.registerContextMenuItem}.
 *
 * When the surface is right-clicked, the host collects the registered
 * contributions, evaluates each {@link ContextMenuContribution.when | when}
 * against the current context keys **and** the freshly-built target object,
 * and dispatches the chosen command with the target as its first argument.
 *
 * @category Registration
 * @public
 */
export interface ContextMenuContribution<S extends MenuSurface = MenuSurface> {
  /** Which context menu to contribute to. */
  surface: S;
  /** The command to run; receives the surface's {@link MenuContext | MenuContext[S]} as its first arg. */
  command: string;
  /** Menu label (falls back to the command's label). */
  label?: string;
  /** Leading glyph for the row (e.g. a Phosphor icon element), same as {@link MenuItem.icon}. */
  icon?: React.ReactNode;
  /** Ordering within the menu; lower sorts first. */
  order?: number;
  /**
   * Optional group id — items with the same group render together with a
   * separator between groups. Group names sort lexically; defaults to
   * `"9_default"`, same as {@link MenuItemContribution.group}.
   */
  group?: string;
  /**
   * Enable/visibility predicate. Receives the same per-surface context as the
   * command plus the current context keys. Returning false hides the item.
   */
  when?: (ctx: ContextKeys, target: MenuContext[S]) => boolean;
  /**
   * Toggle-row predicate. When provided, the item renders with a checkmark
   * in the leading gutter whenever this returns true — the same rendering
   * {@link MenuItem.checked} gives `ctx.ui.showMenu` rows. Lets a single
   * command represent an on/off state (e.g. "enabled for this workspace")
   * instead of registering two mutually-exclusive commands gated by `when`.
   */
  checked?: (ctx: ContextKeys, target: MenuContext[S]) => boolean;
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
   * Namespaced, persisted key/value storage scoped to this panel id (the
   * `workspace` scope of {@link ExtensionStorageScopes}, keyed by panel rather
   * than extension). Use for **panel-local UI state** — scroll positions,
   * selections, expanded sections, etc. — which is kept per workspace. For
   * extension-level settings shared across surfaces and workspaces, use
   * {@link ExtensionContext.storage}`.global` instead.
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
 * e.g. the terminal). Workspaces open panels of registered kinds by id. The
 * optional generic `T` is the shape of the params this kind's panels are
 * opened with — annotate your component with `DockPanelProps<T>` and
 * {@link ExtensionContext.registerDockPanelKind} infers it, no casts needed.
 *
 * @category Registration
 * @public
 */
export interface DockPanelKind<T extends object = Record<string, unknown>> {
  /** Unique id for this panel kind. */
  id: string;
  /** The React component that renders this panel; receives {@link DockPanelProps}. */
  component: React.ComponentType<DockPanelProps<T>>;
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
  /**
   * Sort order within its alignment group. Defaults to 0.
   *
   * The sort direction mirrors the alignment so that **negative values always
   * anchor an item toward the nearest edge**:
   * - **Left items** sort ascending — lower priority = closer to the left edge.
   * - **Right items** sort descending — lower priority = closer to the right edge.
   *
   * **Convention:** built-in (core) items use negative values so they are
   * anchored to their respective edges. Extensions should use `0` or greater,
   * which places them between the two built-in zones by default. An extension
   * may still choose a negative value intentionally to interleave with built-ins.
   */
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
  /**
   * Optional small indicator rendered after the title in the left rail (e.g.
   * an update-available count). Rendered as its own component — separate from
   * {@link SettingsPage.component} — so it can subscribe to reactive state and
   * update independently of whether the page itself is the active one.
   */
  badge?: React.ComponentType;
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
   * Persisted, per-extension key/value storage, in two scopes
   * ({@link ExtensionStorageScopes}): `global` (shared across all workspaces —
   * for the extension's own settings) and `workspace` (scoped to the active
   * workspace). Each is the extension's own bag, shared across all its surfaces
   * — status bar, side panels, and settings page — independent of whether any
   * panel has mounted.
   *
   * `.get()` / `.set()` are safe to call in {@link Extension.activate}. Note the
   * app state hydrates asynchronously and the `workspace` bag is swapped on
   * workspace change, so a value persisted last session may not be present at
   * the instant `activate` runs — `subscribe` and re-read to pick up restored or
   * switched values. (`SidePanelProps.storage` exposes the same `workspace`
   * scope keyed by panel id, for panel-local UI state.)
   */
  readonly storage: ExtensionStorageScopes;
  /** Register an {@link Editor} (a presenter for a file type's editor tab). */
  registerEditor(editor: Editor): Disposable;
  /** Register a {@link FileType} (declarative file metadata). */
  registerFileType(type: FileType): Disposable;
  /** Register a {@link Command} (a named, invokable action). */
  registerCommand(cmd: Command): Disposable;
  /** Register a {@link MenuItemContribution} (place a command in a menu). */
  registerMenuItem(item: MenuItemContribution): Disposable;
  /**
   * Register a {@link ContextMenuContribution} (add a command to a built-in
   * surface's right-click context menu). The invoked command receives the
   * surface's {@link MenuContext} target as its first argument.
   */
  registerContextMenuItem<S extends MenuSurface>(
    item: ContextMenuContribution<S>,
  ): Disposable;
  /** Register a {@link Keybinding} (bind a shortcut to a command). */
  registerKeybinding(binding: Keybinding): Disposable;
  /** Register a {@link SidePanel} (a left/right column panel). */
  registerSidePanel(panel: SidePanel): Disposable;
  /**
   * Register a {@link DockPanelKind} (a center-dock tab kind). The params
   * generic `T` is inferred from the component's {@link DockPanelProps}
   * annotation, so kinds with typed params register without casts.
   */
  registerDockPanelKind<T extends object = Record<string, unknown>>(
    kind: DockPanelKind<T>,
  ): Disposable;
  /** Register a {@link StatusItem} (a status-bar widget). */
  registerStatusItem(item: StatusItem): Disposable;
  /** Register a {@link SettingsPage} (a page in the Settings dialog). */
  registerSettingsPage(page: SettingsPage): Disposable;
  /**
   * Register a {@link ThemePreset} (a selectable theme in the picker).
   * @deprecated Use {@link ThemeService.registerPreset | ctx.theme.registerPreset()} instead.
   *   This method will be removed in a future release.
   */
  registerThemePreset(preset: ThemePreset): Disposable;
  /**
   * Invoke a registered command by id — including commands contributed by
   * other extensions. The minimal "operate" primitive; pairs with the typed
   * services for read access.
   *
   * Optional positional `args` are forwarded to the command's
   * {@link Command.run} function. The returned `Promise` resolves with the
   * command's return value, or rejects if the command throws, is async and
   * rejects, or the id is not registered. Sync commands dispatch synchronously
   * before the promise settles, so callers that read state the command mutates
   * immediately after `await executeCommand(…)` see the updated state.
   *
   * @typeParam T - Expected return type of the command (defaults to `unknown`).
   */
  executeCommand<T = unknown>(id: string, ...args: unknown[]): Promise<T>;
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
   * Workspace process observability — a live view of what is running in each
   * terminal, with optional CPU/memory stats and a surgical kill that leaves the
   * shell alive. Complements {@link ExtensionContext.process} (which spawns
   * sessions); this surface is for reading and controlling what's already running.
   * See {@link ProcessesService} for the full API.
   */
  readonly processes: ProcessesService;
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
   * Real DOM access, navigation control, and native pixel capture inside an
   * `<iframe>` you own — including cross-origin content the browser's
   * same-origin policy would otherwise fully sandbox. Requires the
   * `"webview"` {@link Permission}. See {@link WebviewService}.
   */
  readonly webview: WebviewService;
  /**
   * Static host-platform metadata — the OS, CPU architecture, and running Silo
   * version. Values are baked into the binary at build time and never change
   * during a session. Use to make platform-specific decisions at activation time
   * (e.g. register a macOS-only command, show an arch-specific download URL).
   * See {@link SystemService} for the full API.
   */
  readonly system: SystemService;
  /**
   * Write-only structured logger scoped to this extension. Entries appear in
   * the **Output** panel under the extension's display name. A channel is
   * created automatically at activation and removed at deactivation — no setup
   * required.
   *
   * ```ts
   * ctx.log.info("Extension activated");
   * ctx.log.warn("Unexpected state", { detail: 42 });
   * ctx.log.show(); // open the Output panel, select this extension's channel
   * ```
   */
  readonly log: LogService;
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

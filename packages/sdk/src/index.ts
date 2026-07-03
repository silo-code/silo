/**
 * The `@silo-code/sdk` public surface — the single curated entry point an
 * extension author imports from. Re-exports **only** the blessed, permanently
 * supported types and runtime helpers. Anything not re-exported here is
 * host-internal and may change without notice.
 *
 * **What's here:** the types-first extension contract (see `types.ts`) plus a
 * small set of blessed runtime helpers (`Tooltip`, `useFocusGroup`,
 * `useServiceState`, `DND_MIME`, `PathDeniedError`, `NetworkError`). The SDK
 * peer-depends on React 19; changes to the runtime helpers can be breaking
 * even when the types are unchanged.
 *
 * This is also the entry point the API-reference generator (TypeDoc) reads, so
 * the published reference is exactly this surface — no more, no less.
 *
 * @packageDocumentation
 */

// Core contract + contribution-point types.
export type {
  Disposable,
  DockPanelApi,
  DockPanelProps,
  EditorProps,
  EditorCapabilities,
  Editor,
  NewFileTemplate,
  FileType,
  Command,
  MenuId,
  MenuItemContribution,
  Keybinding,
  SidePanelProps,
  SidePanel,
  DockPanelKind,
  StatusItem,
  SettingsPage,
  ExtensionContext,
  Extension,
  ExtensionManifest,
  ExtensionHandle,
} from "./types";

// Public domain types (the persisted shapes surfaced through the services).
// TerminalKind/TerminalRecord and the theme types are re-exported via their
// service modules below; these are the remaining ones consumers can name.
export type {
  Workspace,
  EditorMode,
  EditorRecord,
  SidePanelSlot,
} from "./domain-types";

// Consumer services exposed on the ExtensionContext.
export type {
  WorkspaceService,
  WorkspaceState,
  CreateWorkspaceInput,
  WorkspaceStatusRow,
  WorkspaceStatusProvider,
  WorkspaceSectionProps,
  WorkspaceSectionProvider,
  WorkspaceBadge,
  WorkspaceBadgeProvider,
} from "./workspace-service";
export type {
  EditorService,
  EditorSaveHandlers,
  OpenFileOptions,
  EditorViewInfo,
  OpenDiffSpec,
  DiffContent,
  DiffContentRequest,
  DiffContentProvider,
  ActiveEditorInfo,
  EditorsState,
  EditorSaveEvent,
} from "./editor-service";
export type {
  LayoutService,
  LayoutState,
  SidePanelColumnState,
  SideLocation,
} from "./layout-service";
export type {
  ProcessService,
  ProcessSession,
  ProcessSpawnOptions,
  ProcessExecOptions,
  ProcessExecResult,
} from "./process-service";
export type {
  ProcessesService,
  ProcessInfo,
  ProcessStats,
} from "./processes-service";
export type {
  TerminalService,
  CreateTerminalInput,
  TerminalKind,
  TerminalRecord,
  TerminalTabDecoration,
  TerminalTabDecorationProvider,
  OscEvent,
} from "./terminal-service";
export type {
  FileService,
  FileMeta,
  FileChangeKind,
  FileChangeEvent,
} from "./file-service";
// Cross-file content search exposed on the ExtensionContext as `ctx.search`.
export type {
  SearchService,
  SearchOptions,
  SearchMatch,
  SearchFileResult,
  SearchResponse,
} from "./search-service";
// The permission surface: the capability vocabulary an extension declares, and
// the error the host throws when an extension reaches outside the workspace
// without the matching grant. `PathDeniedError` is a class (a runtime value).
export type { Permission } from "./permissions";
export { PathDeniedError } from "./permissions";
// The theme domain: the consumer service + its state/resolve shapes, the
// `ThemePreset` contribution type (registered via ctx.registerThemePreset), and
// the underlying theme types (re-exported from ./domain-types via theme-service).
export type {
  ThemeService,
  ThemeState,
  ThemePreset,
  ResolvedTheme,
  ThemeBase,
  ThemeVars,
  CustomTheme,
  ThemeExport,
} from "./theme-service";
export type {
  ExtensionStorage,
  ExtensionStorageScopes,
} from "./extension-storage";
// The drag-and-drop domain: the consumer service + its payload/handler shapes.
// DND_MIME is a value (the well-known MIME vocabulary), so it's a runtime export.
export type {
  DndService,
  DndItem,
  DndMime,
  DragInit,
  DndMode,
  DropContext,
  DropTargetHandlers,
} from "./dnd-service";
export { DND_MIME } from "./dnd-service";
// The user-interaction domain: native pickers + toast notifications + menus,
// plus the file-filter shape the pickers accept, the menu item/entry shapes
// `showMenu` accepts, and the modal-chrome options `showModal` accepts.
export type {
  UiService,
  FileFilter,
  MenuItem,
  MenuItemTrailing,
  MenuSeparator,
  MenuHeader,
  MenuEntry,
  ShowMenuOptions,
  ConfirmOptions,
  PromptOptions,
  ModalOptions,
  NotifyAction,
  NotifyOptions,
} from "./ui-service";

// Server-side HTTP client — bypasses CORS, readable response headers.
export { NetworkError } from "./network-service";
export type {
  NetworkService,
  NetworkRequestOptions,
  NetworkResponse,
  NetworkBytesResponse,
} from "./network-service";

// Static host-platform metadata: OS, CPU arch, and Silo version.
export type { SystemService, SystemInfo } from "./system-service";

// Structured output logging — the write-only channel extensions receive as
// `ctx.log`. LogLevel is also used by the Output panel's built-in channels
// (e.g. `silo:notifications`).
export type { LogService, LogLevel } from "./output-service";

// Context keys referenced by `when` predicates on menu items / keybindings.
export type { ContextKeys } from "./context-keys";

// Typed event primitive: a subscribable Event<T> that returns a Disposable.
// The matching host-side emitter is internal to the extension-host package.
export type { Event } from "./event";

// Pure path utilities — cross-platform replacement for `node:path` (banned in
// extensions). All outputs use forward-slash separators. Both "/" and "\" are
// accepted as input. Exported as a namespaced `path` object.
export { path } from "./path";

// Tooltip — the same styled hover popup the host uses in the status bar.
// Extensions use this instead of native `title` attributes to match host chrome.
export { Tooltip } from "./Tooltip";

// Runtime helpers. The one blessed way for an extension to read a `ctx`
// service's reactive state in React — replaces hand-rolled useSyncExternalStore.
export { useServiceState } from "./use-service-state";
export type { ReactiveService } from "./use-service-state";
// Headless keyboard navigation for a focus group (list / menu / toolbar / …):
// one tab stop, arrow/Home/End movement, the WebKit-safe keyboard ring. The
// `focusGroupNextIndex` helper is the pure roving-index core for widgets that
// can't use the focus-driven hook (e.g. menus driven by a document listener).
export { useFocusGroup, focusGroupNextIndex } from "./use-focus-group";
export type {
  FocusGroup,
  FocusGroupOptions,
  FocusGroupContainerProps,
  FocusGroupItemProps,
  FocusGroupOrientation,
  FocusGroupNavQuery,
} from "./use-focus-group";

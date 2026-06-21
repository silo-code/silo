/**
 * The public Silo extension API surface — the single curated entry point an
 * extension author imports from. This is the seed of the future `@silo-code/sdk`
 * package: it re-exports **only** the blessed, permanently supported types.
 * Anything not re-exported here is host-internal and may change without notice.
 *
 * It is also the entry point the API-reference generator (TypeDoc) reads, so
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
  TerminalService,
  CreateTerminalInput,
  TerminalKind,
  TerminalRecord,
} from "./terminal-service";
export type { FileService, FileMeta, FileChangeEvent } from "./file-service";
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
export type { ExtensionStorage } from "./extension-storage";
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
export type {
  NetworkService,
  NetworkRequestOptions,
  NetworkResponse,
} from "./network-service";

// Context keys referenced by `when` predicates on menu items / keybindings.
export type { ContextKeys } from "./context-keys";

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

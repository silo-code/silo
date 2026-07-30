/**
 * The **privileged** Silo extension surface — `@silo-code/extension-host/internal`.
 *
 * This is the second of the two barrels (the public one is {@link module:sdk
 * `@silo-code/sdk`}). It is lint-gated to the `core.*` tier only
 * (`src/extensions/core/**`); `silo.*` and third-party extensions physically
 * cannot import it. It exists for capability a *core* extension genuinely needs
 * but that is unsafe or inappropriate to hand to independently-shipped
 * (`silo.*`) or third-party extensions.
 *
 * **Importing from here _is_ the mark.** A typed, greppable, reviewable record
 * of every privileged use — strictly better than scattered `eslint-disable`s or
 * baseline suppressions (which carry "temporary, burn to 0" semantics). A
 * privileged exception recorded here is permanent by design.
 *
 * The **size of this barrel is the health metric**: small = the public
 * `@silo-code/sdk` is doing its job; bloated = capabilities are hiding as "core-only"
 * that either belong in public or shouldn't exist. Public-first is the rule for
 * deciding which barrel — see
 * `docs/architecture-audit/ctx-domains.md` → "Extension trust tiers and the
 * two-barrel surface".
 *
 * Entries land here only as the boundary burn-down
 * (`docs/architecture-audit/02-enforcement.md`) resolves a `core.*` host-access
 * violation to "mark as `@silo-code/extension-host/internal`" (rather than "route through public
 * `ctx`" or "delete").
 *
 * @packageDocumentation
 */

// Host-owned modal chrome for arbitrary custom content — the declarative
// component behind `ctx.ui.confirm`/`prompt`/`showModal`. Kept core-only (not on
// the public `@silo-code/sdk` leaf): it's a runtime React component over a
// host-owned valtio store, so exporting it publicly would drag react-dom/valtio
// + a behavioral-compatibility obligation into the types-first leaf. The public
// "render custom modal content" capability ships instead as the imperative
// host-owned `ctx.ui.showModal` (ui-service.ts), which renders the caller's
// content inside this same `<Modal>`. Core extensions may still use `<Modal>`
// directly for declarative layouts (e.g. the settings dialog).
export { Modal } from "./Modal";
// ModalActions is public SDK surface (RFC 0016); re-exported here so existing
// core.* callers that import from the internal barrel keep resolving.
export { ModalActions } from "@silo-code/sdk";
export type { ModalProps } from "./Modal";

// A `ctx.ui.showModal`-based confirm/info dialog with a persisted "don't show
// this again" checkbox — a capability `ctx.ui.confirm` has no room for.
// Core-only: it's bespoke host content built on `<Modal>`, not a public
// contract addition (see the file's header comment for the rationale).
export { confirmWithDontShowAgain } from "./confirm-with-dont-show-again";
export type {
  DontShowAgainDialogMode,
  DontShowAgainDialogOptions,
} from "./confirm-with-dont-show-again";

// App identity metadata (version/name) — privileged because its only consumer
// is `core.about`, part of Silo's identity; not a public-surface capability.
// See app-service.ts for the rationale.
export type { AppService } from "./app-service";
export { getAppService } from "./app-service";

// Install the `silo` shell command — privileged because it writes an executable
// onto the user's PATH that points at the host binary; only the core
// "Install `silo` command" action (`core.cli-install`) needs it, never a
// silo.*/third-party extension. See services/tauri-cli.ts.
export { installCliShim } from "../services/tauri-cli";

// Reactive auto-update state — privileged because self-updating the installed
// app (download + install a binary, relaunch) is a host/platform capability only
// `core.updates` (and the app's "Check for Updates…" menu item) needs; not a
// public-surface capability. See update-service.ts for the rationale.
export type { UpdateService, UpdateState, UpdatePhase } from "./update-service";
export { getUpdateService } from "./update-service";

// The extension manager — install / uninstall / enable / disable / load runtime
// extensions. Core-only **by design**: loading and unloading other extensions is
// a privileged host capability that silo.*/third-party extensions must not have.
// Its sole consumer is the `core.extensions` settings page. See
// extension-manager.ts.
export type {
  ExtensionManager,
  ExtensionManagerState,
  InstalledExtension,
  InstallSource,
  ManifestPreview,
} from "./extension-manager";
export { getExtensionManager } from "./extension-manager";
// The registry client — browse/search data for the manager page and id → pinned
// tarball resolution. Same core-only rationale as the manager it feeds.
export type {
  RegistryExtension,
  RegistryIndex,
  RegistryUpdate,
  RegistryVersionInfo,
} from "./registry-client";
export {
  DEFAULT_REGISTRY_URL,
  fetchRegistryIndex,
  registryReadmeUrl,
} from "./registry-client";
// The rail group the manager page shares with all non-core settings pages, so
// the manager declares the same key the host forces non-core pages into.
export { EXTENSIONS_SETTINGS_GROUP } from "./settings-pages";

// Host-mediated OS access for core UI: the user's home dir, for home-relative
// path display (workspaces). A path-display concern, not user interaction, so it
// stays internal rather than going on public `ctx.ui` (the native file/folder
// pickers that used to sit here graduated to `ctx.ui`; see ui-service.ts). See
// platform.ts.
export { homeDir } from "./platform";

// Workspace section registry — exposed here (rather than on the public
// WorkspaceService type) because reading back the full provider list, including
// React component references, is a core-extension-only concern. The *write* side
// (registerSection / subscribeSection) is public via ctx.workspaces; only the
// WorkspacesPanel needs to enumerate providers to render them. See
// workspace-section-registry.ts.
export { workspaceSectionRegistry } from "./workspace-section-registry";

// Workspace property page registry (RFC 0015) — same rationale as the section
// registry above: reading back the full page list (React component refs) to
// render the properties-modal tab bar is a core-extension-only concern. The
// *write* side (registerPropertyPage) is public via ctx.workspaces.
export { workspacePropertyPageRegistry } from "./workspace-property-page-registry";

// Context-menu contribution read side (RFC 0013) — the *write* side
// (registerContextMenuItem) is public via ctx; building the merged menu rows
// for a surface is a core-extension concern (the built-in surface owns its
// menu and appends these). See context-menu-items.ts.
export { contextMenuEntriesFor } from "./context-menu-items";

// Reading a command's menu placement back out (rather than registering one)
// is a core-extension-only concern — today the sole caller is `core.keybindings`,
// which uses it to group the shortcuts list by the same File/View/Window/Help
// buckets the native menu already uses, instead of duplicating that taxonomy.
export { menuFor } from "./menu-items";

// Editor host-plumbing — the raw Monaco/editor host access that `core.editor`
// needs but that is wrong to hand to silo.*/third-party (Tier 3 "raw Monaco
// setup"; see ctx-domains.md → "The editor surface"). NOTE what is deliberately
// *absent*: theme-read routes through public `ctx.theme`, file I/O through
// `ctx.files`, document/tab ops through `ctx.editors`, and drag-and-drop through
// `ctx.dnd` — only the genuinely host-bound editor internals live here.
// Workspace panel groups — group CRUD and reorder operations consumed
// exclusively by WorkspacesPanel (core.*). The *read* side uses useSnapshot(store)
// which is already exported below; these are the *write* operations. Not public
// because groups are a panel-organizational concern, not a WorkspaceService
// concept — no silo.*/third-party extension needs to manage panel groupings.
export {
  createGroup,
  renameGroup,
  deleteGroup,
  setGroupColor,
  reorderPanel,
  moveWorkspaceToGroup,
  ungroupWorkspace,
  reorderWorkspaceInGroup,
  toggleGroupCollapsed,
  groupIdForWorkspace,
  workspaceGroupMap,
  closeGroup,
  restoreGroup,
} from "../state/workspaces";
export type { WorkspaceGroup, WorkspaceInternal } from "../state/types";
// Shared "Saved" menu partitioning (closed groups vs individually-listed
// workspaces) used by the host empty-state menu and the workspaces add menus.
export { partitionSavedEntries } from "../state/partition-saved-entries";
export type { ClosedGroupEntry } from "../state/partition-saved-entries";

export {
  // The shared editor seam: reactive host store + the editor/diff record model,
  // scroll positions, editor settings get/set, the Monaco theme-name mapping +
  // onMount setup, language detection, the text/diff option builders, and the
  // lazy Monaco bootstrap. (The native file pickers moved to platform.ts.)
  store,
  findEditor,
  setEditorFilePath,
  setEditorScrollPosition,
  getEditorScrollPosition,
  setEditorViewState,
  getEditorViewState,
  setEditorBackup,
  clearEditorBackup,
  readEditorBackup,
  resolveRestoredBuffer,
  getEditorSettings,
  setEditorSetting,
  getEditorSettingOverride,
  mergeEditorSettings,
  toggleEditorViewOption,
  monacoThemeName,
  getDiffContentProvider,
  languageFromPath,
  toTextEditorOptions,
  toDiffEditorOptions,
  setupMonacoEditor,
  ensureMonaco,
} from "./editor-core";
export type {
  EditorSettings,
  EditorSettingsOverride,
  RenderWhitespace,
  RenderLineHighlight,
} from "./editor-core";
// Resolve which registered editor presents a given record (the editor panel's
// dispatch). Host-bound to the editor registry.
export { resolveEditorForRecord } from "./editor-registry";
// Editor "jump to selection" channel — `ctx.editors.open(path, { selection })`
// publishes here; the core editor view consumes it to reveal+select the match.
// Host-bound (operates on the live Monaco instance), so core-only.
export {
  takePendingReveal,
  peekPendingReveal,
  onRevealRequest,
} from "./editor-reveal";
export type { RevealSelection, PendingReveal } from "./editor-reveal";
// Active-selection registry behind `ctx.ui.getActiveSelectionText()` — the
// focused editor/terminal registers its selection getter here on focus. The
// *read* side is public (`ctx.ui`); this *register* side is host-bound, core-only.
export { registerSelectionSource } from "./active-selection";
// Editor document seam behind `ctx.editors.getText`/`isDirty`/`onDidSave`. The
// mounted text editor registers a live text/dirty provider per editorId, and
// fires `emitDidSave` after a confirmed write. The *read* side is public
// (`ctx.editors`); these *register/emit* sides are host-bound, core-only.
export { registerDocumentProvider, emitDidSave } from "./editor-service";
// Terminal host-plumbing — the terminal's shared seam (mirrors editor-core), for
// the `core.terminal` DockKind view. NOTE what is deliberately *absent*: PTY
// sessions route through public `ctx.process`, opening a file through
// `ctx.editors`, and drag-and-drop through `ctx.dnd` — only the genuinely
// host-bound terminal record recreate + xterm theme-base lookup live here. The
// shared `store` is the `editor-core` re-export above (same `state/store`).
export {
  recreateTerminal,
  tauriTerminalClient,
  getThemeBase,
  getTerminalSettings,
  setTerminalSetting,
} from "./terminal-core";
export type { TerminalSettings, TerminalCursorStyle } from "./terminal-core";
export {
  MIN_TERMINAL_SCROLL_SENSITIVITY,
  MAX_TERMINAL_SCROLL_SENSITIVITY,
  MAX_TERMINAL_FAST_SCROLL_SENSITIVITY,
} from "./terminal-core";
// Focus-retry helpers that win dockview's focus shuffle for Monaco/xterm — host
// DOM/focus plumbing, not a public capability.
export {
  retryFocus,
  useFocusOnActive,
  blurTextareaWithin,
  isTextareaFocusedWithin,
} from "./use-focus-retry";

// App-shell operations the base menu (`core.menu`) drives — core-only **by
// design**, not stopgaps. UI-font scale (zoom) is app chrome (see
// app-settings.ts); settings-dialog open/close is host shell behind the
// `settings.open`/`settings.close` commands; pickWorkspaceFolder resolves which
// of a workspace's folders to target (sole folder, else a chooser modal). No
// `silo.*`/third-party extension needs these, so the internal barrel is their
// correct home (public-first rule). A public `ctx.settings` (and any further
// `ctx.ui`) is deferred until a real public consumer exists — we don't expand
// the `ctx` surface ahead of a requirement.
export { bumpUiFontSize, resetUiFontSize } from "./app-settings";
export { openSettings, closeSettings } from "./settings-dialog";
export { pickWorkspaceFolder } from "./pick-folder";
// Dock/area keyboard navigation the base menu (core.menu) drives — cycling the
// focused area's tabs, moving across split groups, or moving focus across the
// top-level regions (side docks, center, status bar). App-shell behavior over
// the host's dockview + layout DOM, core-only (the public tab surface is
// `ctx.editors`). See dock-api-registry.ts and focus-regions.ts.
export {
  cycleTabInFocusedArea,
  cycleActiveGroup,
} from "../docked/dock-api-registry";
export { cycleRegionFocus } from "./focus-regions";

// Output panel store — per-channel valtio state read by the core.output dock
// panel. The write path is public (`ctx.log`, auto-channel per extension, plus
// `ctx.ui.notify` → the silo:notifications channel). Only core.output needs to
// read back entries; `createHostChannel` lets other host services (e.g.
// future build/lint) add channels without going through `ctx`.
export { outputStore, createHostChannel, clearChannel } from "./output-store";
export type { OutputChannelState, OutputEntry } from "./output-store";

// Dev-shell window actions (Reload / Inspect Element) the base menu (core.menu)
// surfaces under the Window menu in dev builds, replacing what the now-suppressed
// native context menu used to offer. Host/platform-bound, core-only.
export { reloadWindow, openDevtools } from "./devtools";

// Keybindings management — host introspection over the command/keybinding/keymap
// registries, so `core.keybindings` can enumerate every command + its effective
// key to render and edit the shortcuts page. This is the *read/manage* side; the
// public *write* side is `ctx.executeCommand`. Not for silo.*/third-party.
export { commandRegistry } from "./commands";
export { keybindingRegistry } from "./keybindings";
export {
  displayKey,
  effectiveKey,
  defaultKey,
  getUserBindings,
  saveUserBindings,
  keybindingsPath,
  onKeymapChange,
  overrideKey,
  isRemoved,
  setKeybindingCaptureActive,
} from "./keymap";

// Foreground-process updates for a terminal session (RFC 0010 N1) — consumed by
// the built-in terminal for tab titles. Core-only; not public SDK surface.
export { onTerminalForeground } from "./terminal-foreground";
export type { TerminalForeground } from "./terminal-foreground";

// `ctx.agents`'s death/reset hooks (RFC 0018) — called by the built-in
// terminal panel at the exact moment it observes SESSION_GONE on reattach
// (notifyTerminalSessionGone) and once a fresh session replaces it
// (notifyTerminalSessionRecreated). Core-only; not public SDK surface —
// ctx.agents itself is read-only.
export {
  notifyTerminalSessionGone,
  notifyTerminalSessionRecreated,
} from "./agents-service";

// The agent catalog (RFC 0018) — the single source of truth for every agent
// Silo supports. Detection/resume-hint resolution consume it host-side; the
// `core.agents-settings` page reads `hookInstallableAgents()` (and the hook
// descriptor on each entry) to render the install toggles. Core-only —
// detection/resume are sealed, so there is no public `registerAgent`.
export {
  hookInstallableAgents,
  sessionFileAgents,
  buildTrackSessionScript,
  TRACK_SCRIPT_REL,
  AGENT_HOOKS_DIR_REL,
} from "./agent-catalog";
export type {
  AgentDefinition,
  AgentHookResume,
  HookInstallStrategy,
} from "./agent-catalog";

// Tooltip — re-exported here so core.* extensions can still import it from the
// internal barrel. The component itself is now public (@silo-code/sdk); the
// host component file re-exports from SDK and owns the CSS load.
export { Tooltip } from "../components/Tooltip";

// Small-screen-mode settings (global on/off + width threshold) — read/write
// for the `core.layout` settings page. The auto-hide/peek behavior itself is
// host-internal (small-screen-mode.ts, wired directly into AppShell); only the
// two user-facing preferences need a settings-page seam.
export {
  setSmallScreenModeEnabled,
  setSmallScreenThresholdPx,
} from "../state/store";
export {
  DEFAULT_SMALL_SCREEN_THRESHOLD_PX,
  MIN_SMALL_SCREEN_THRESHOLD_PX,
} from "../state/types";

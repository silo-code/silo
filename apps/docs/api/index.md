# Using `ctx` <Badge type="tip" text="stable" />

> The domains below are **available now**. For what's still being designed
> (`ctx.settings`, `ctx.secrets`, …) see the [Roadmap](/roadmap).

You write an [`Extension`](/api/types/interfaces/Extension) and the host calls
its `activate(ctx)` once, handing you an
[`ExtensionContext`](/api/types/interfaces/ExtensionContext) — **`ctx`**.
Everything your extension does flows through `ctx`, and it comes down to three
things:

| Group                             | What it's for                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| **[Registration](#registration)** | add things to the app — editors, panels, commands, status items, menus, keybindings… |
| **[Services](#services)**         | read &amp; drive the running app through typed domain services                       |
| **[Other](#other)**               | invoke commands; consume other extensions' APIs; identity                            |

New here? Start with the [guide](/guide/). Otherwise drill into a method below —
each page has the signature, an example, and links down to the
[type definitions](/api/types/).

## Registration

Add things to the app. Each method takes a typed object and returns a
[`Disposable`](/api/types/interfaces/Disposable) (the host also tracks it on
`ctx.subscriptions`, so teardown is automatic).

| Method                                                                    | Adds                                  |
| ------------------------------------------------------------------------- | ------------------------------------- |
| [`ctx.registerEditor`](/api/registration/register-editor)                 | an editor (presenter) for a file type |
| [`ctx.registerSidePanel`](/api/registration/register-side-panel)          | a left/right column panel             |
| [`ctx.registerStatusItem`](/api/registration/register-status-item)        | a status-bar widget                   |
| [`ctx.registerCommand`](/api/registration/register-command)               | a named, invokable action             |
| [`ctx.registerKeybinding`](/api/registration/register-keybinding)         | a shortcut bound to a command         |
| [`ctx.registerMenuItem`](/api/registration/register-menu-item)            | a command in an application menu      |
| [`ctx.registerFileType`](/api/registration/register-file-type)            | declarative file metadata             |
| [`ctx.registerDockPanelKind`](/api/registration/register-dock-panel-kind) | a center-dock tab kind                |
| [`ctx.registerSettingsPage`](/api/registration/register-settings-page)    | a page in the Settings dialog         |
| [`ctx.registerThemePreset`](/api/registration/register-theme-preset)      | a selectable theme in the picker      |

## Services

Read and drive the running app through typed domain services — never by
importing the store or touching the platform directly. Opening files lives on
`ctx.editors` (not `ctx.workspaces`).

| Member                                    | Purpose                                                                                                                                                                                                            |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`ctx.editors`](/api/editors/)            | open files into editor tabs; `save` / `saveAs` / `closeActive`; `registerSaveHandler` ([`EditorService`](/api/types/interfaces/EditorService))                                                                     |
| [`ctx.terminals`](/api/state/terminals)   | open / reap terminal tabs; `registerTabDecoration` to add icon+color+tooltip badges to terminal tabs ([`TerminalService`](/api/types/interfaces/TerminalService))                                                  |
| [`ctx.workspaces`](/api/state/workspaces) | workspaces &amp; editor tabs; `registerStatus` for status rows, `registerSection` to mount React components, `registerBadge` for inline name badges ([`WorkspaceService`](/api/types/interfaces/WorkspaceService)) |
| [`ctx.layout`](/api/state/layout)         | side-panel collapse state ([`LayoutService`](/api/types/interfaces/LayoutService))                                                                                                                                 |
| [`ctx.storage`](/api/storage/)            | persisted per-extension key/value storage, `global` &amp; `workspace` scopes ([`ExtensionStorageScopes`](/api/types/interfaces/ExtensionStorageScopes))                                                            |
| [`ctx.files`](/api/files/)                | read / write / list / watch the filesystem, host-mediated ([`FileService`](/api/types/interfaces/FileService))                                                                                                     |
| [`ctx.process`](/api/process/)            | persistent process / PTY sessions that survive restarts ([`ProcessService`](/api/types/interfaces/ProcessService))                                                                                                 |
| [`ctx.processes`](/api/processes/)        | live foreground process view per terminal — leader, cwd, idle/busy, optional CPU+memory, surgical kill ([`ProcessesService`](/api/types/interfaces/ProcessesService))                                              |
| [`ctx.search`](/api/search/)              | cross-file content search over the workspace ([`SearchService`](/api/types/interfaces/SearchService))                                                                                                              |
| [`ctx.theme`](/api/theme/)                | presets + active theme + custom themes ([`ThemeService`](/api/types/interfaces/ThemeService))                                                                                                                      |
| [`ctx.dnd`](/api/dnd/)                    | drag sources + drop targets with typed payloads ([`DndService`](/api/types/interfaces/DndService))                                                                                                                 |
| [`ctx.ui`](/api/ui/)                      | native pickers + toasts + menus + modals (`confirm` / `prompt` / `showModal`) ([`UiService`](/api/types/interfaces/UiService))                                                                                     |
| [`ctx.net`](/api/net/)                    | server-side HTTP client — bypasses browser CORS, reads any response header ([`NetworkService`](/api/types/interfaces/NetworkService))                                                                              |
| [`ctx.system`](/api/system/)              | static host-platform metadata — OS, CPU arch, and Silo version ([`SystemService`](/api/types/interfaces/SystemService))                                                                                            |

## Other

| Member                                                     | Purpose                                                                                                            |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [`ctx.executeCommand`](/api/other/execute-command)         | invoke any registered command by id                                                                                |
| [`ctx.getExtension`](/api/other/get-extension)             | consume another extension's published API ([`ExtensionHandle`](/api/types/interfaces/ExtensionHandle))             |
| `ctx.extensionId`                                          | this extension's id (read-only)                                                                                    |
| `ctx.subscriptions`                                        | the [`Disposable`](/api/types/interfaces/Disposable)s the host tears down on unload                                |
| [`useServiceState`](/api/other/use-service-state)          | React hook to read any service's reactive state ([`ReactiveService`](/api/types/interfaces/ReactiveService))       |
| [`useFocusGroup`](/api/other/use-focus-group)              | React hook for keyboard nav of a focus group — list / menu / toolbar: one tab stop, arrows, the keyboard ring      |
| [`focusGroupNextIndex`](/api/other/focus-group-next-index) | the pure roving-index helper `useFocusGroup` runs — for widgets that can't use the hook (e.g. menus)               |
| [`Tooltip`](/api/other/tooltip)                            | styled hover popup matching the host's status-bar tooltip — wrap any button or icon, 600 ms delay, portal-rendered |

---

Looking for a type? The full, generated [type reference](/api/types/) lists every
interface and type alias in the SDK.

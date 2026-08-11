# Interface: ExtensionContext

Defined in: [packages/sdk/src/types.ts:659](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L659)

The object handed to [Extension.activate](Extension.md#activate). It is the *only* sanctioned
way an extension touches the running app: register contributions, invoke
commands, and read/drive state through the typed consumer services. Every
`register*` call returns a [Disposable](Disposable.md) and is also tracked on
[ExtensionContext.subscriptions](#subscriptions).

## Properties

### extensionId

```ts
readonly extensionId: string;
```

Defined in: [packages/sdk/src/types.ts:661](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L661)

The activating extension's id (its [Extension.id](Extension.md#id)).

***

### subscriptions

```ts
readonly subscriptions: Disposable[];
```

Defined in: [packages/sdk/src/types.ts:663](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L663)

Disposables tracked for this extension; the host disposes them on teardown.

***

### storage

```ts
readonly storage: ExtensionStorageScopes;
```

Defined in: [packages/sdk/src/types.ts:679](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L679)

Persisted, per-extension key/value storage, in two scopes
([ExtensionStorageScopes](ExtensionStorageScopes.md)): `global` (shared across all workspaces —
for the extension's own settings) and `workspace` (scoped to the active
workspace). Each is the extension's own bag, shared across all its surfaces
— status bar, side panels, and settings page — independent of whether any
panel has mounted.

`.get()` / `.set()` are safe to call in [Extension.activate](Extension.md#activate). Note the
app state hydrates asynchronously and the `workspace` bag is swapped on
workspace change, so a value persisted last session may not be present at
the instant `activate` runs — `subscribe` and re-read to pick up restored or
switched values. (`SidePanelProps.storage` exposes the same `workspace`
scope keyed by panel id, for panel-local UI state.)

***

### workspaces

```ts
readonly workspaces: WorkspaceService;
```

Defined in: [packages/sdk/src/types.ts:761](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L761)

Consumer API for driving workspace state — create, rename, reorder,
activate, soft close/reopen, and hard delete. Subscribe to a frozen
state for read access without depending on Valtio.

***

### editors

```ts
readonly editors: EditorService;
```

Defined in: [packages/sdk/src/types.ts:767](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L767)

The editor & document domain — open files into editor tabs, drive the
active editor (save / close), and register editor save handlers. Opening
editors lives here, not on [ExtensionContext.workspaces](#workspaces).

***

### layout

```ts
readonly layout: LayoutService;
```

Defined in: [packages/sdk/src/types.ts:773](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L773)

Consumer API for app layout — side-panel collapse state. Read via
getState/useServiceState/subscribe; drive via toggleSidePanel /
setSidePanelCollapsed.

***

### process

```ts
readonly process: ProcessService;
```

Defined in: [packages/sdk/src/types.ts:779](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L779)

Persistent process / PTY sessions that **survive app restarts** — the core
primitive under the terminal (and future task runners, REPLs). Spawn or
re-attach a session and drive it via the returned `ProcessSession`.

***

### processes

```ts
readonly processes: ProcessesService;
```

Defined in: [packages/sdk/src/types.ts:787](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L787)

Workspace process observability — a live view of what is running in each
terminal, with optional CPU/memory stats and a surgical kill that leaves the
shell alive. Complements [ExtensionContext.process](#process) (which spawns
sessions); this surface is for reading and controlling what's already running.
See [ProcessesService](ProcessesService.md) for the full API.

***

### agents

```ts
readonly agents: AgentsService;
```

Defined in: [packages/sdk/src/types.ts:797](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L797)

Host-computed coding-agent activity and resume-identity observability —
a live, read-only view of what each terminal's agent is doing
(`none`/`working`/`idle`/`error`/`dead`) and, once a terminal's
backend is confirmed dead after an unclean shutdown, a resume hint for
it. Detection is fully sealed in the host implementation; there is no
registration API. **@beta** — the shape may still change. See
[AgentsService](AgentsService.md) for the full API.

***

### terminals

```ts
readonly terminals: TerminalService;
```

Defined in: [packages/sdk/src/types.ts:805](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L805)

Consumer API for the terminal domain — open a terminal tab in a workspace
(`create`) or reap a workspace's terminals (`closeWorkspace`). The terminal
is a core feature (a built-in DockKind like the editor); its tabs render
from the workspace's records, and PTY sessions live on
[ExtensionContext.process](#process).

***

### files

```ts
readonly files: FileService;
```

Defined in: [packages/sdk/src/types.ts:811](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L811)

Host-mediated filesystem access — read / write / list / watch, all routed
through the host rather than raw Tauri. The single privileged chokepoint
for the filesystem; watcher lifecycle is host-owned (see [FileService](FileService.md)).

***

### search

```ts
readonly search: SearchService;
```

Defined in: [packages/sdk/src/types.ts:818](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L818)

Cross-file content search over the workspace — the core primitive under the
Search panel (and future quick-open / find-references). Runs a native search
engine in the host (off the UI thread), honoring `.gitignore`, and resolves
with matches grouped by file. See [SearchService](SearchService.md).

***

### theme

```ts
readonly theme: ThemeService;
```

Defined in: [packages/sdk/src/types.ts:825](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L825)

Consumer API for the theme domain — read the merged preset set + active
theme, switch themes, and manage custom themes. Read via getState /
subscribe; contribute a new preset via
[ExtensionContext.registerThemePreset](#registerthemepreset).

***

### dnd

```ts
readonly dnd: DndService;
```

Defined in: [packages/sdk/src/types.ts:832](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L832)

Drag-and-drop — be a drag source ([DndService.beginDrag](DndService.md#begindrag)) and a drop
target ([DndService.registerDropTarget](DndService.md#registerdroptarget)), with typed payloads
([DND\_MIME](../variables/DND_MIME.md)) that interoperate across extensions. The host owns the
drag affordance and the modifier-mode resolution.

***

### ui

```ts
readonly ui: UiService;
```

Defined in: [packages/sdk/src/types.ts:839](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L839)

User-interaction — the only sanctioned way to talk to the user (the host
renders the chrome). Native file/folder pickers ([UiService.pickFolder](UiService.md#pickfolder),
[UiService.pickFile](UiService.md#pickfile), [UiService.savePath](UiService.md#savepath)) and transient toast
notifications ([UiService.notify](UiService.md#notify)). Mirrors VS Code's `window.show*`.

***

### net

```ts
readonly net: NetworkService;
```

Defined in: [packages/sdk/src/types.ts:847](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L847)

Server-side HTTP client — makes requests from the Rust backend, bypassing
the browser's CORS policy. Use when browser `fetch` is insufficient:
reading response headers from cross-origin requests, probing localhost
services without CORS headers, or checking iframe embeddability before
loading a URL. See [NetworkService](NetworkService.md) for the full API.

***

### webview

```ts
readonly webview: WebviewService;
```

Defined in: [packages/sdk/src/types.ts:854](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L854)

Real DOM access, navigation control, and native pixel capture inside an
`<iframe>` you own — including cross-origin content the browser's
same-origin policy would otherwise fully sandbox. Requires the
`"webview"` [Permission](../type-aliases/Permission.md). See [WebviewService](WebviewService.md).

***

### system

```ts
readonly system: SystemService;
```

Defined in: [packages/sdk/src/types.ts:862](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L862)

Static host-platform metadata — the OS, CPU architecture, and running Silo
version. Values are baked into the binary at build time and never change
during a session. Use to make platform-specific decisions at activation time
(e.g. register a macOS-only command, show an arch-specific download URL).
See [SystemService](SystemService.md) for the full API.

***

### log

```ts
readonly log: LogService;
```

Defined in: [packages/sdk/src/types.ts:875](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L875)

Write-only structured logger scoped to this extension. Entries appear in
the **Output** panel under the extension's display name. A channel is
created automatically at activation and removed at deactivation — no setup
required.

```ts
ctx.log.info("Extension activated");
ctx.log.warn("Unexpected state", { detail: 42 });
ctx.log.show(); // open the Output panel, select this extension's channel
```

## Methods

### registerEditor()

```ts
registerEditor(editor): Disposable;
```

Defined in: [packages/sdk/src/types.ts:681](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L681)

Register an [Editor](Editor.md) (a presenter for a file type's editor tab).

#### Parameters

##### editor

[`Editor`](Editor.md)

#### Returns

[`Disposable`](Disposable.md)

***

### registerFileType()

```ts
registerFileType(type): Disposable;
```

Defined in: [packages/sdk/src/types.ts:683](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L683)

Register a [FileType](FileType.md) (declarative file metadata).

#### Parameters

##### type

[`FileType`](FileType.md)

#### Returns

[`Disposable`](Disposable.md)

***

### registerCommand()

```ts
registerCommand(cmd): Disposable;
```

Defined in: [packages/sdk/src/types.ts:685](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L685)

Register a [Command](Command.md) (a named, invokable action).

#### Parameters

##### cmd

[`Command`](Command.md)

#### Returns

[`Disposable`](Disposable.md)

***

### registerMenuItem()

```ts
registerMenuItem(item): Disposable;
```

Defined in: [packages/sdk/src/types.ts:687](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L687)

Register a [MenuItemContribution](MenuItemContribution.md) (place a command in a menu).

#### Parameters

##### item

[`MenuItemContribution`](MenuItemContribution.md)

#### Returns

[`Disposable`](Disposable.md)

***

### registerContextMenuItem()

```ts
registerContextMenuItem<S>(item): Disposable;
```

Defined in: [packages/sdk/src/types.ts:693](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L693)

Register a [ContextMenuContribution](ContextMenuContribution.md) (add a command to a built-in
surface's right-click context menu). The invoked command receives the
surface's [MenuContext](MenuContext.md) target as its first argument.

#### Type Parameters

##### S

`S` *extends* [`MenuSurface`](../type-aliases/MenuSurface.md)

#### Parameters

##### item

[`ContextMenuContribution`](ContextMenuContribution.md)\<`S`\>

#### Returns

[`Disposable`](Disposable.md)

***

### registerToolbarItem()

```ts
registerToolbarItem<S>(item): Disposable;
```

Defined in: [packages/sdk/src/types.ts:704](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L704)

Register a [ToolbarItemContribution](../type-aliases/ToolbarItemContribution.md) (icon-only, text-only,
icon+text, or dropdown) in the trailing cluster of an editor or terminal
toolbar. Independent of [ExtensionContext.registerContextMenuItem](#registercontextmenuitem)
— register either, both, or neither. Hosts only show items while that
surface's breadcrumbs setting is on. See
[ExtensionContext.invalidateToolbarItems](#invalidatetoolbaritems).

#### Type Parameters

##### S

`S` *extends* [`ToolbarSurface`](../type-aliases/ToolbarSurface.md)

#### Parameters

##### item

[`ToolbarItemContribution`](../type-aliases/ToolbarItemContribution.md)\<`S`\>

#### Returns

[`Disposable`](Disposable.md)

***

### invalidateToolbarItems()

```ts
invalidateToolbarItems(): void;
```

Defined in: [packages/sdk/src/types.ts:712](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L712)

Signal that toolbar-item `when` / `checked` data changed. Causes every
toolbar surface — editor, terminal, and the Navigator header — to re-query
contributions and re-render.

#### Returns

`void`

***

### registerKeybinding()

```ts
registerKeybinding(binding): Disposable;
```

Defined in: [packages/sdk/src/types.ts:714](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L714)

Register a [Keybinding](Keybinding.md) (bind a shortcut to a command).

#### Parameters

##### binding

[`Keybinding`](Keybinding.md)

#### Returns

[`Disposable`](Disposable.md)

***

### registerSidePanel()

```ts
registerSidePanel(panel): Disposable;
```

Defined in: [packages/sdk/src/types.ts:716](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L716)

Register a [SidePanel](SidePanel.md) (a left/right column panel).

#### Parameters

##### panel

[`SidePanel`](SidePanel.md)

#### Returns

[`Disposable`](Disposable.md)

***

### registerNavigatorView()

```ts
registerNavigatorView(view): Disposable;
```

Defined in: [packages/sdk/src/types.ts:722](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L722)

Register a [NavigatorView](NavigatorView.md) — a projection the user can switch the
Navigator panel to. Prefer this over a second side panel when your surface
is another way to navigate the app.

#### Parameters

##### view

[`NavigatorView`](NavigatorView.md)

#### Returns

[`Disposable`](Disposable.md)

***

### registerDockPanelKind()

```ts
registerDockPanelKind<T>(kind): Disposable;
```

Defined in: [packages/sdk/src/types.ts:728](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L728)

Register a [DockPanelKind](DockPanelKind.md) (a center-dock tab kind). The params
generic `T` is inferred from the component's [DockPanelProps](DockPanelProps.md)
annotation, so kinds with typed params register without casts.

#### Type Parameters

##### T

`T` *extends* `object` = `Record`\<`string`, `unknown`\>

#### Parameters

##### kind

[`DockPanelKind`](DockPanelKind.md)\<`T`\>

#### Returns

[`Disposable`](Disposable.md)

***

### registerStatusItem()

```ts
registerStatusItem(item): Disposable;
```

Defined in: [packages/sdk/src/types.ts:732](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L732)

Register a [StatusItem](StatusItem.md) (a status-bar widget).

#### Parameters

##### item

[`StatusItem`](StatusItem.md)

#### Returns

[`Disposable`](Disposable.md)

***

### registerSettingsPage()

```ts
registerSettingsPage(page): Disposable;
```

Defined in: [packages/sdk/src/types.ts:734](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L734)

Register a [SettingsPage](SettingsPage.md) (a page in the Settings dialog).

#### Parameters

##### page

[`SettingsPage`](SettingsPage.md)

#### Returns

[`Disposable`](Disposable.md)

***

### ~~registerThemePreset()~~

```ts
registerThemePreset(preset): Disposable;
```

Defined in: [packages/sdk/src/types.ts:740](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L740)

Register a [ThemePreset](ThemePreset.md) (a selectable theme in the picker).

#### Parameters

##### preset

[`ThemePreset`](ThemePreset.md)

#### Returns

[`Disposable`](Disposable.md)

#### Deprecated

Use [ctx.theme.registerPreset()](ThemeService.md#registerpreset) instead.
  This method will be removed in a future release.

***

### executeCommand()

```ts
executeCommand<T>(id, ...args): Promise<T>;
```

Defined in: [packages/sdk/src/types.ts:755](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L755)

Invoke a registered command by id — including commands contributed by
other extensions. The minimal "operate" primitive; pairs with the typed
services for read access.

Optional positional `args` are forwarded to the command's
[Command.run](Command.md#run) function. The returned `Promise` resolves with the
command's return value, or rejects if the command throws, is async and
rejects, or the id is not registered. Sync commands dispatch synchronously
before the promise settles, so callers that read state the command mutates
immediately after `await executeCommand(…)` see the updated state.

#### Type Parameters

##### T

`T` = `unknown`

Expected return type of the command (defaults to `unknown`).

#### Parameters

##### id

`string`

##### args

...`unknown`[]

#### Returns

`Promise`\<`T`\>

***

### getExtension()

```ts
getExtension<API>(id): ExtensionHandle<API> | undefined;
```

Defined in: [packages/sdk/src/types.ts:889](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L889)

Resolve a handle to another extension in order to consume the API it
published (the value its [Extension.activate](Extension.md#activate) returned). This is how
features that live *outside* core — git, terminal, themes — expose
capabilities to other extensions.

Returns `undefined` if no extension with that id is known. Even when known,
the handle's [api](ExtensionHandle.md#api-1) is `undefined` until that
extension has activated — so **always handle absence**; the provider may be
disabled or activate after you. Call this at use time, not in `activate`.

#### Type Parameters

##### API

`API` = `unknown`

the provider's published API type (import its types package).

#### Parameters

##### id

`string`

#### Returns

[`ExtensionHandle`](ExtensionHandle.md)\<`API`\> \| `undefined`

# Interface: ExtensionContext

Defined in: [packages/sdk/src/types.ts:412](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L412)

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

Defined in: [packages/sdk/src/types.ts:414](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L414)

The activating extension's id (its [Extension.id](Extension.md#id)).

***

### subscriptions

```ts
readonly subscriptions: Disposable[];
```

Defined in: [packages/sdk/src/types.ts:416](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L416)

Disposables tracked for this extension; the host disposes them on teardown.

***

### storage

```ts
readonly storage: ExtensionStorageScopes;
```

Defined in: [packages/sdk/src/types.ts:432](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L432)

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

Defined in: [packages/sdk/src/types.ts:464](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L464)

Consumer API for driving workspace state — create, rename, reorder,
activate, soft close/reopen, and hard delete. Subscribe to a frozen
state for read access without depending on Valtio.

***

### editors

```ts
readonly editors: EditorService;
```

Defined in: [packages/sdk/src/types.ts:470](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L470)

The editor & document domain — open files into editor tabs, drive the
active editor (save / close), and register editor save handlers. Opening
editors lives here, not on [ExtensionContext.workspaces](#workspaces).

***

### layout

```ts
readonly layout: LayoutService;
```

Defined in: [packages/sdk/src/types.ts:476](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L476)

Consumer API for app layout — side-panel collapse state. Read via
getState/useServiceState/subscribe; drive via toggleSidePanel /
setSidePanelCollapsed.

***

### process

```ts
readonly process: ProcessService;
```

Defined in: [packages/sdk/src/types.ts:482](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L482)

Persistent process / PTY sessions that **survive app restarts** — the core
primitive under the terminal (and future task runners, REPLs). Spawn or
re-attach a session and drive it via the returned `ProcessSession`.

***

### processes

```ts
readonly processes: ProcessesService;
```

Defined in: [packages/sdk/src/types.ts:490](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L490)

Workspace process observability — a live view of what is running in each
terminal, with optional CPU/memory stats and a surgical kill that leaves the
shell alive. Complements [ExtensionContext.process](#process) (which spawns
sessions); this surface is for reading and controlling what's already running.
See [ProcessesService](ProcessesService.md) for the full API.

***

### terminals

```ts
readonly terminals: TerminalService;
```

Defined in: [packages/sdk/src/types.ts:498](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L498)

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

Defined in: [packages/sdk/src/types.ts:504](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L504)

Host-mediated filesystem access — read / write / list / watch, all routed
through the host rather than raw Tauri. The single privileged chokepoint
for the filesystem; watcher lifecycle is host-owned (see [FileService](FileService.md)).

***

### search

```ts
readonly search: SearchService;
```

Defined in: [packages/sdk/src/types.ts:511](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L511)

Cross-file content search over the workspace — the core primitive under the
Search panel (and future quick-open / find-references). Runs a native search
engine in the host (off the UI thread), honoring `.gitignore`, and resolves
with matches grouped by file. See [SearchService](SearchService.md).

***

### theme

```ts
readonly theme: ThemeService;
```

Defined in: [packages/sdk/src/types.ts:518](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L518)

Consumer API for the theme domain — read the merged preset set + active
theme, switch themes, and manage custom themes. Read via getState /
subscribe; contribute a new preset via
[ExtensionContext.registerThemePreset](#registerthemepreset).

***

### dnd

```ts
readonly dnd: DndService;
```

Defined in: [packages/sdk/src/types.ts:525](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L525)

Drag-and-drop — be a drag source ([DndService.beginDrag](DndService.md#begindrag)) and a drop
target ([DndService.registerDropTarget](DndService.md#registerdroptarget)), with typed payloads
([DND\_MIME](../variables/DND_MIME.md)) that interoperate across extensions. The host owns the
drag affordance and the modifier-mode resolution.

***

### ui

```ts
readonly ui: UiService;
```

Defined in: [packages/sdk/src/types.ts:532](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L532)

User-interaction — the only sanctioned way to talk to the user (the host
renders the chrome). Native file/folder pickers ([UiService.pickFolder](UiService.md#pickfolder),
[UiService.pickFile](UiService.md#pickfile), [UiService.savePath](UiService.md#savepath)) and transient toast
notifications ([UiService.notify](UiService.md#notify)). Mirrors VS Code's `window.show*`.

***

### net

```ts
readonly net: NetworkService;
```

Defined in: [packages/sdk/src/types.ts:540](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L540)

Server-side HTTP client — makes requests from the Rust backend, bypassing
the browser's CORS policy. Use when browser `fetch` is insufficient:
reading response headers from cross-origin requests, probing localhost
services without CORS headers, or checking iframe embeddability before
loading a URL. See [NetworkService](NetworkService.md) for the full API.

## Methods

### registerEditor()

```ts
registerEditor(editor): Disposable;
```

Defined in: [packages/sdk/src/types.ts:434](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L434)

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

Defined in: [packages/sdk/src/types.ts:436](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L436)

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

Defined in: [packages/sdk/src/types.ts:438](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L438)

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

Defined in: [packages/sdk/src/types.ts:440](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L440)

Register a [MenuItemContribution](MenuItemContribution.md) (place a command in a menu).

#### Parameters

##### item

[`MenuItemContribution`](MenuItemContribution.md)

#### Returns

[`Disposable`](Disposable.md)

***

### registerKeybinding()

```ts
registerKeybinding(binding): Disposable;
```

Defined in: [packages/sdk/src/types.ts:442](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L442)

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

Defined in: [packages/sdk/src/types.ts:444](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L444)

Register a [SidePanel](SidePanel.md) (a left/right column panel).

#### Parameters

##### panel

[`SidePanel`](SidePanel.md)

#### Returns

[`Disposable`](Disposable.md)

***

### registerDockPanelKind()

```ts
registerDockPanelKind(kind): Disposable;
```

Defined in: [packages/sdk/src/types.ts:446](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L446)

Register a [DockPanelKind](DockPanelKind.md) (a center-dock tab kind).

#### Parameters

##### kind

[`DockPanelKind`](DockPanelKind.md)

#### Returns

[`Disposable`](Disposable.md)

***

### registerStatusItem()

```ts
registerStatusItem(item): Disposable;
```

Defined in: [packages/sdk/src/types.ts:448](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L448)

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

Defined in: [packages/sdk/src/types.ts:450](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L450)

Register a [SettingsPage](SettingsPage.md) (a page in the Settings dialog).

#### Parameters

##### page

[`SettingsPage`](SettingsPage.md)

#### Returns

[`Disposable`](Disposable.md)

***

### registerThemePreset()

```ts
registerThemePreset(preset): Disposable;
```

Defined in: [packages/sdk/src/types.ts:452](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L452)

Register a [ThemePreset](ThemePreset.md) (a selectable theme in the picker).

#### Parameters

##### preset

[`ThemePreset`](ThemePreset.md)

#### Returns

[`Disposable`](Disposable.md)

***

### executeCommand()

```ts
executeCommand(id): void;
```

Defined in: [packages/sdk/src/types.ts:458](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L458)

Invoke a registered command by id — including commands contributed by
other extensions. The minimal "operate" primitive; pairs with the typed
services for read access.

#### Parameters

##### id

`string`

#### Returns

`void`

***

### getExtension()

```ts
getExtension<API>(id): ExtensionHandle<API> | undefined;
```

Defined in: [packages/sdk/src/types.ts:554](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L554)

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

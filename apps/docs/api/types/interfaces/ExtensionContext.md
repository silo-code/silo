# Interface: ExtensionContext

Defined in: [packages/sdk/src/types.ts:360](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L360)

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

Defined in: [packages/sdk/src/types.ts:362](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L362)

The activating extension's id (its [Extension.id](Extension.md#id)).

***

### subscriptions

```ts
readonly subscriptions: Disposable[];
```

Defined in: [packages/sdk/src/types.ts:364](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L364)

Disposables tracked for this extension; the host disposes them on teardown.

***

### workspaces

```ts
readonly workspaces: WorkspaceService;
```

Defined in: [packages/sdk/src/types.ts:396](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L396)

Consumer API for driving workspace state — create, rename, reorder,
activate, soft close/reopen, and hard delete. Subscribe to a frozen
state for read access without depending on Valtio.

***

### editors

```ts
readonly editors: EditorService;
```

Defined in: [packages/sdk/src/types.ts:402](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L402)

The editor & document domain — open files into editor tabs, drive the
active editor (save / close), and register editor save handlers. Opening
editors lives here, not on [ExtensionContext.workspaces](#workspaces).

***

### layout

```ts
readonly layout: LayoutService;
```

Defined in: [packages/sdk/src/types.ts:408](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L408)

Consumer API for app layout — side-panel collapse state. Read via
getState/useServiceState/subscribe; drive via toggleSidePanel /
setSidePanelCollapsed.

***

### process

```ts
readonly process: ProcessService;
```

Defined in: [packages/sdk/src/types.ts:414](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L414)

Persistent process / PTY sessions that **survive app restarts** — the core
primitive under the terminal (and future task runners, REPLs). Spawn or
re-attach a session and drive it via the returned `ProcessSession`.

***

### terminals

```ts
readonly terminals: TerminalService;
```

Defined in: [packages/sdk/src/types.ts:422](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L422)

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

Defined in: [packages/sdk/src/types.ts:428](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L428)

Host-mediated filesystem access — read / write / list / watch, all routed
through the host rather than raw Tauri. The single privileged chokepoint
for the filesystem; watcher lifecycle is host-owned (see [FileService](FileService.md)).

***

### theme

```ts
readonly theme: ThemeService;
```

Defined in: [packages/sdk/src/types.ts:435](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L435)

Consumer API for the theme domain — read the merged preset set + active
theme, switch themes, and manage custom themes. Read via getState /
subscribe; contribute a new preset via
[ExtensionContext.registerThemePreset](#registerthemepreset).

***

### dnd

```ts
readonly dnd: DndService;
```

Defined in: [packages/sdk/src/types.ts:442](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L442)

Drag-and-drop — be a drag source ([DndService.beginDrag](DndService.md#begindrag)) and a drop
target ([DndService.registerDropTarget](DndService.md#registerdroptarget)), with typed payloads
([DND\_MIME](../variables/DND_MIME.md)) that interoperate across extensions. The host owns the
drag affordance and the modifier-mode resolution.

***

### ui

```ts
readonly ui: UiService;
```

Defined in: [packages/sdk/src/types.ts:449](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L449)

User-interaction — the only sanctioned way to talk to the user (the host
renders the chrome). Native file/folder pickers ([UiService.pickFolder](UiService.md#pickfolder),
[UiService.pickFile](UiService.md#pickfile), [UiService.savePath](UiService.md#savepath)) and transient toast
notifications ([UiService.notify](UiService.md#notify)). Mirrors VS Code's `window.show*`.

## Methods

### registerEditor()

```ts
registerEditor(editor): Disposable;
```

Defined in: [packages/sdk/src/types.ts:366](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L366)

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

Defined in: [packages/sdk/src/types.ts:368](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L368)

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

Defined in: [packages/sdk/src/types.ts:370](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L370)

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

Defined in: [packages/sdk/src/types.ts:372](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L372)

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

Defined in: [packages/sdk/src/types.ts:374](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L374)

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

Defined in: [packages/sdk/src/types.ts:376](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L376)

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

Defined in: [packages/sdk/src/types.ts:378](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L378)

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

Defined in: [packages/sdk/src/types.ts:380](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L380)

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

Defined in: [packages/sdk/src/types.ts:382](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L382)

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

Defined in: [packages/sdk/src/types.ts:384](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L384)

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

Defined in: [packages/sdk/src/types.ts:390](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L390)

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

Defined in: [packages/sdk/src/types.ts:463](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L463)

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

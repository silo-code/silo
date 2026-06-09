# Interface: EditorService

Defined in: [packages/sdk/src/editor-service.ts:137](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L137)

The editor & document domain, exposed as [ExtensionContext.editors](ExtensionContext.md#editors).
Open files into editor tabs, drive the active editor (save / close), and let
editor viewers register save handlers. The single entry point for opening
editors — prefer it over reaching into workspace/editor state.

## Methods

### open()

```ts
open(path, opts?): void;
```

Defined in: [packages/sdk/src/editor-service.ts:142](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L142)

Open a file in an editor tab. Promotes an existing preview, focuses an
already-open tab, or opens a new one.

#### Parameters

##### path

`string`

##### opts?

[`OpenFileOptions`](OpenFileOptions.md)

#### Returns

`void`

***

### openUntitled()

```ts
openUntitled(opts?): void;
```

Defined in: [packages/sdk/src/editor-service.ts:144](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L144)

Open a fresh untitled editor.

#### Parameters

##### opts?

[`OpenFileOptions`](OpenFileOptions.md)

#### Returns

`void`

***

### openDiff()

```ts
openDiff(spec, opts?): void;
```

Defined in: [packages/sdk/src/editor-service.ts:149](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L149)

Open a diff view. The content is supplied by the [provider](OpenDiffSpec.md#providerid)
named in `spec` — the editor itself is content-agnostic.

#### Parameters

##### spec

[`OpenDiffSpec`](OpenDiffSpec.md)

##### opts?

[`OpenFileOptions`](OpenFileOptions.md)

#### Returns

`void`

***

### save()

```ts
save(): boolean;
```

Defined in: [packages/sdk/src/editor-service.ts:151](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L151)

Save the active editor. Returns false if there's no active saveable editor.

#### Returns

`boolean`

***

### saveAs()

```ts
saveAs(): boolean;
```

Defined in: [packages/sdk/src/editor-service.ts:153](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L153)

Save-as the active editor. Returns false if unavailable.

#### Returns

`boolean`

***

### closeActive()

```ts
closeActive(): boolean;
```

Defined in: [packages/sdk/src/editor-service.ts:155](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L155)

Close the active dock panel. Returns false if there's nothing to close.

#### Returns

`boolean`

***

### editorsFor()

```ts
editorsFor(path): EditorViewInfo[];
```

Defined in: [packages/sdk/src/editor-service.ts:164](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L164)

List the editor views that match `path` (or `null` for an untitled buffer),
highest-priority first, each flagged whether it's the one the host resolves
by default. Read-only enumeration for building "Open With" menus and the
breadcrumb view-switcher. Returns `[]` only when nothing matches — in
practice never empty for a real path, since the core text editor matches
everything.

#### Parameters

##### path

`string` \| `null`

#### Returns

[`EditorViewInfo`](EditorViewInfo.md)[]

***

### setViewType()

```ts
setViewType(
   editorId, 
   viewType, 
   opts?): void;
```

Defined in: [packages/sdk/src/editor-service.ts:173](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L173)

Switch an already-open editor tab to a different view in place — without
closing and reopening it — and persist the choice on the tab. No-op if the
editor isn't found, `viewType` names no registered editor, or that editor
doesn't match the tab's file. The panel remounts onto the new view, so
per-instance state (scroll, selection) resets — expected, it's a different
presenter.

#### Parameters

##### editorId

`string`

##### viewType

`string`

##### opts?

###### workspaceId?

`string`

#### Returns

`void`

***

### registerSaveHandler()

```ts
registerSaveHandler(editorId, handlers): Disposable;
```

Defined in: [packages/sdk/src/editor-service.ts:183](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L183)

Register save handlers for an editor instance (by its `editorId`), so the
active-editor `save` / `saveAs` dispatch to it while it's focused. Dispose
to unregister (do this when the editor unmounts).

#### Parameters

##### editorId

`string`

##### handlers

[`EditorSaveHandlers`](EditorSaveHandlers.md)

#### Returns

[`Disposable`](Disposable.md)

***

### registerDiffContentProvider()

```ts
registerDiffContentProvider(providerId, provider): Disposable;
```

Defined in: [packages/sdk/src/editor-service.ts:192](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L192)

Register a [DiffContentProvider](../type-aliases/DiffContentProvider.md) under `providerId`. A diff opened
with that `providerId` (see [OpenDiffSpec](OpenDiffSpec.md)) resolves its two sides
through this provider, on every mount. Dispose to unregister.

#### Parameters

##### providerId

`string`

##### provider

[`DiffContentProvider`](../type-aliases/DiffContentProvider.md)

#### Returns

[`Disposable`](Disposable.md)

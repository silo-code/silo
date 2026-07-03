# Interface: EditorService

Defined in: [packages/sdk/src/editor-service.ts:225](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L225)

The editor & document domain, exposed as [ExtensionContext.editors](ExtensionContext.md#editors).
Open files into editor tabs, drive the active editor (save / close), and let
editors register save handlers. The single entry point for opening editors —
prefer it over reaching into workspace/editor state.

## Properties

### onDidSave

```ts
onDidSave: Event<EditorSaveEvent>;
```

Defined in: [packages/sdk/src/editor-service.ts:317](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L317)

Fires after an editor tab's contents are saved to disk — a formatter,
linter, or build-on-save extension's entry point. See [Event](../type-aliases/Event.md).

#### Example

```ts
ctx.subscriptions.push(
  ctx.editors.onDidSave(({ editorId, filePath }) => {
    ctx.log.info(`saved ${filePath}`);
  }),
);
```

## Methods

### open()

```ts
open(path, opts?): void;
```

Defined in: [packages/sdk/src/editor-service.ts:230](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L230)

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

Defined in: [packages/sdk/src/editor-service.ts:232](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L232)

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

Defined in: [packages/sdk/src/editor-service.ts:237](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L237)

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

Defined in: [packages/sdk/src/editor-service.ts:239](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L239)

Save the active editor. Returns false if there's no active saveable editor.

#### Returns

`boolean`

***

### saveAs()

```ts
saveAs(): boolean;
```

Defined in: [packages/sdk/src/editor-service.ts:241](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L241)

Save-as the active editor. Returns false if unavailable.

#### Returns

`boolean`

***

### closeActive()

```ts
closeActive(): boolean;
```

Defined in: [packages/sdk/src/editor-service.ts:243](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L243)

Close the active dock panel. Returns false if there's nothing to close.

#### Returns

`boolean`

***

### editorsFor()

```ts
editorsFor(path): EditorViewInfo[];
```

Defined in: [packages/sdk/src/editor-service.ts:252](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L252)

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

Defined in: [packages/sdk/src/editor-service.ts:261](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L261)

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

Defined in: [packages/sdk/src/editor-service.ts:271](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L271)

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

Defined in: [packages/sdk/src/editor-service.ts:280](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L280)

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

***

### getText()

```ts
getText(editorId): Promise<string | undefined>;
```

Defined in: [packages/sdk/src/editor-service.ts:298](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L298)

The current buffer text of an open editor tab, including unsaved edits.

Resolves `undefined` when the tab isn't text-backed (e.g. the image
viewer) or hasn't mounted yet — a lazy-mounted dock panel is **not**
force-mounted to read its text. It is async precisely because the text
lives in the mounted editor component, not in host state.

#### Parameters

##### editorId

`string`

#### Returns

`Promise`\<`string` \| `undefined`\>

#### Example

```ts
const text = await ctx.editors.getText(editorId);
if (text !== undefined) ctx.log.info(`${text.length} chars`);
```

***

### isDirty()

```ts
isDirty(editorId): boolean;
```

Defined in: [packages/sdk/src/editor-service.ts:303](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L303)

Whether an open editor tab has unsaved changes. Returns `false` for an
unknown id or a tab that isn't mounted / text-backed.

#### Parameters

##### editorId

`string`

#### Returns

`boolean`

***

### getState()

```ts
getState(): EditorsState;
```

Defined in: [packages/sdk/src/editor-service.ts:330](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L330)

Current frozen snapshot of editor state. The returned object is
referentially stable between renders — `getState() === getState()` when
nothing has changed, which satisfies `useSyncExternalStore`'s contract and
means `useServiceState(ctx.editors)` works without extra memoization.

#### Returns

[`EditorsState`](EditorsState.md)

#### Example

```ts
const { active } = ctx.editors.getState();
if (active) ctx.log.info(`Active file: ${active.filePath ?? "(untitled)"}`);
```

***

### subscribe()

```ts
subscribe(listener): Disposable;
```

Defined in: [packages/sdk/src/editor-service.ts:349](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L349)

Subscribe to changes in the active editor. The listener is called whenever
`active` changes (tab focus moves, workspace switches, editor opens or
closes) or `hydrated` flips. Returns a [Disposable](Disposable.md) that cancels the
subscription.

Use `useServiceState(ctx.editors)` in React components instead of calling
`subscribe` directly — it wraps `getState` + `subscribe` for you.

#### Parameters

##### listener

(`state`) => `void`

#### Returns

[`Disposable`](Disposable.md)

#### Example

```ts
ctx.subscriptions.push(
  ctx.editors.subscribe(({ active }) => {
    statusItem.setTitle(active?.filePath ?? "No file");
  }),
);
```

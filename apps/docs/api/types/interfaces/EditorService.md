# Interface: EditorService

Defined in: [packages/sdk/src/editor-service.ts:235](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L235)

The editor & document domain, exposed as [ExtensionContext.editors](ExtensionContext.md#editors).
Open files into editor tabs, drive the active editor (save / close), and let
editors register save handlers. The single entry point for opening editors —
prefer it over reaching into workspace/editor state.

Tab chrome adornments (`setIcon` / `setIndicator` / …) take an **editor id**
as the target — see [TabAdornmentMethods](TabAdornmentMethods.md).

## Extends

- [`TabAdornmentMethods`](TabAdornmentMethods.md)

## Properties

### onDidSave

```ts
onDidSave: Event<EditorSaveEvent>;
```

Defined in: [packages/sdk/src/editor-service.ts:331](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L331)

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

Defined in: [packages/sdk/src/editor-service.ts:240](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L240)

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

Defined in: [packages/sdk/src/editor-service.ts:242](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L242)

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

Defined in: [packages/sdk/src/editor-service.ts:247](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L247)

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

Defined in: [packages/sdk/src/editor-service.ts:249](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L249)

Save the active editor. Returns false if there's no active saveable editor.

#### Returns

`boolean`

***

### saveAs()

```ts
saveAs(): boolean;
```

Defined in: [packages/sdk/src/editor-service.ts:251](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L251)

Save-as the active editor. Returns false if unavailable.

#### Returns

`boolean`

***

### closeActive()

```ts
closeActive(): boolean;
```

Defined in: [packages/sdk/src/editor-service.ts:253](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L253)

Close the active dock panel. Returns false if there's nothing to close.

#### Returns

`boolean`

***

### editorsFor()

```ts
editorsFor(path): EditorViewInfo[];
```

Defined in: [packages/sdk/src/editor-service.ts:262](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L262)

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

Defined in: [packages/sdk/src/editor-service.ts:271](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L271)

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

Defined in: [packages/sdk/src/editor-service.ts:281](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L281)

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

Defined in: [packages/sdk/src/editor-service.ts:290](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L290)

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

Defined in: [packages/sdk/src/editor-service.ts:311](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L311)

The current buffer text of an open editor tab, including unsaved edits.

Resolves `undefined` when the tab isn't text-backed (e.g. the image
viewer), has never mounted a text document, and has no retained unsaved
buffer. A dirty text editor that unmounts on a view switch (e.g. Text →
Markdown Preview) retains its buffer so presenters can still read it. A
lazy-mounted dock panel is **not** force-mounted to read its text. It is
async precisely because the live text lives in the mounted editor
component, not in host state.

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

Defined in: [packages/sdk/src/editor-service.ts:317](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L317)

Whether an open editor tab has unsaved changes. Returns `false` for an
unknown id or a tab that isn't text-backed and has no retained dirty
buffer. Stays `true` across a dirty Text → Preview view switch.

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

Defined in: [packages/sdk/src/editor-service.ts:344](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L344)

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

Defined in: [packages/sdk/src/editor-service.ts:363](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L363)

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

***

### setIcon()

```ts
setIcon(targetId, adornment): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:229](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L229)

#### Parameters

##### targetId

`string`

##### adornment

[`TabIconAdornment`](TabIconAdornment.md)

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`setIcon`](TabAdornmentMethods.md#seticon)

***

### clearIcon()

```ts
clearIcon(targetId, adornmentId): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:230](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L230)

#### Parameters

##### targetId

`string`

##### adornmentId

`string`

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`clearIcon`](TabAdornmentMethods.md#clearicon)

***

### bindIcon()

```ts
bindIcon(binder): Disposable;
```

Defined in: [packages/sdk/src/tab-adornment.ts:231](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L231)

#### Parameters

##### binder

[`TabIconBinder`](TabIconBinder.md)

#### Returns

[`Disposable`](Disposable.md)

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`bindIcon`](TabAdornmentMethods.md#bindicon)

***

### setHighlight()

```ts
setHighlight(targetId, adornment): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:233](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L233)

#### Parameters

##### targetId

`string`

##### adornment

[`TabHighlightAdornment`](TabHighlightAdornment.md)

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`setHighlight`](TabAdornmentMethods.md#sethighlight)

***

### clearHighlight()

```ts
clearHighlight(targetId, adornmentId): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:234](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L234)

#### Parameters

##### targetId

`string`

##### adornmentId

`string`

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`clearHighlight`](TabAdornmentMethods.md#clearhighlight)

***

### bindHighlight()

```ts
bindHighlight(binder): Disposable;
```

Defined in: [packages/sdk/src/tab-adornment.ts:235](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L235)

#### Parameters

##### binder

[`TabHighlightBinder`](TabHighlightBinder.md)

#### Returns

[`Disposable`](Disposable.md)

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`bindHighlight`](TabAdornmentMethods.md#bindhighlight)

***

### setIndicator()

```ts
setIndicator(targetId, adornment): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:237](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L237)

#### Parameters

##### targetId

`string`

##### adornment

[`TabIndicatorAdornment`](TabIndicatorAdornment.md)

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`setIndicator`](TabAdornmentMethods.md#setindicator)

***

### clearIndicator()

```ts
clearIndicator(targetId, adornmentId): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:238](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L238)

#### Parameters

##### targetId

`string`

##### adornmentId

`string`

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`clearIndicator`](TabAdornmentMethods.md#clearindicator)

***

### flashIndicator()

```ts
flashIndicator(targetId, flash): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:239](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L239)

#### Parameters

##### targetId

`string`

##### flash

[`TabIndicatorFlash`](../type-aliases/TabIndicatorFlash.md)

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`flashIndicator`](TabAdornmentMethods.md#flashindicator)

***

### bindIndicator()

```ts
bindIndicator(binder): Disposable;
```

Defined in: [packages/sdk/src/tab-adornment.ts:240](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L240)

#### Parameters

##### binder

[`TabIndicatorBinder`](TabIndicatorBinder.md)

#### Returns

[`Disposable`](Disposable.md)

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`bindIndicator`](TabAdornmentMethods.md#bindindicator)

***

### setActivity()

```ts
setActivity(targetId, adornment): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:242](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L242)

#### Parameters

##### targetId

`string`

##### adornment

[`TabActivityAdornment`](TabActivityAdornment.md)

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`setActivity`](TabAdornmentMethods.md#setactivity)

***

### clearActivity()

```ts
clearActivity(targetId, adornmentId): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:243](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L243)

#### Parameters

##### targetId

`string`

##### adornmentId

`string`

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`clearActivity`](TabAdornmentMethods.md#clearactivity)

***

### flashActivity()

```ts
flashActivity(targetId, flash): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:244](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L244)

#### Parameters

##### targetId

`string`

##### flash

[`TabActivityFlash`](../type-aliases/TabActivityFlash.md)

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`flashActivity`](TabAdornmentMethods.md#flashactivity)

***

### bindActivity()

```ts
bindActivity(binder): Disposable;
```

Defined in: [packages/sdk/src/tab-adornment.ts:245](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L245)

#### Parameters

##### binder

[`TabActivityBinder`](TabActivityBinder.md)

#### Returns

[`Disposable`](Disposable.md)

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`bindActivity`](TabAdornmentMethods.md#bindactivity)

***

### getIcons()

```ts
getIcons(targetId): TabIconAdornment[];
```

Defined in: [packages/sdk/src/tab-adornment.ts:248](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L248)

All leading icons for `targetId`, in set/bind order.

#### Parameters

##### targetId

`string`

#### Returns

[`TabIconAdornment`](TabIconAdornment.md)[]

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`getIcons`](TabAdornmentMethods.md#geticons)

***

### getHighlight()

```ts
getHighlight(targetId): TabHighlightAdornment | null;
```

Defined in: [packages/sdk/src/tab-adornment.ts:253](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L253)

The whole-tab highlight for `targetId`, or `null` if none. At most one
applies — first found across `set`/`bind` order.

#### Parameters

##### targetId

`string`

#### Returns

[`TabHighlightAdornment`](TabHighlightAdornment.md) \| `null`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`getHighlight`](TabAdornmentMethods.md#gethighlight)

***

### getIndicators()

```ts
getIndicators(targetId): TabIndicatorAdornment[];
```

Defined in: [packages/sdk/src/tab-adornment.ts:255](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L255)

All trailing indicators for `targetId`, in set/bind/flash order.

#### Parameters

##### targetId

`string`

#### Returns

[`TabIndicatorAdornment`](TabIndicatorAdornment.md)[]

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`getIndicators`](TabAdornmentMethods.md#getindicators)

***

### getActivities()

```ts
getActivities(targetId): TabActivityAdornment[];
```

Defined in: [packages/sdk/src/tab-adornment.ts:257](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L257)

All trailing activities for `targetId`, in set/bind/flash order.

#### Parameters

##### targetId

`string`

#### Returns

[`TabActivityAdornment`](TabActivityAdornment.md)[]

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`getActivities`](TabAdornmentMethods.md#getactivities)

***

### invalidateTabAdornments()

```ts
invalidateTabAdornments(): void;
```

Defined in: [packages/sdk/src/tab-adornment.ts:259](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L259)

Signal that binder data changed — re-query `provide` and re-render.

#### Returns

`void`

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`invalidateTabAdornments`](TabAdornmentMethods.md#invalidatetabadornments)

***

### subscribeTabAdornments()

```ts
subscribeTabAdornments(listener): Disposable;
```

Defined in: [packages/sdk/src/tab-adornment.ts:260](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L260)

#### Parameters

##### listener

() => `void`

#### Returns

[`Disposable`](Disposable.md)

#### Inherited from

[`TabAdornmentMethods`](TabAdornmentMethods.md).[`subscribeTabAdornments`](TabAdornmentMethods.md#subscribetabadornments)

# Interface: Editor

Defined in: [packages/sdk/src/types.ts:150](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L150)

Contributes a presenter for a file type — everything that opens in the editor
area is an `Editor` (a read-write text editor, a read-only image viewer, …).
The host picks one per file by calling each registered editor's
[Editor.match](#match) (highest [Editor.priority](#priority) wins) and mounting its
[Editor.component](#component). Registered via
[ExtensionContext.registerEditor](ExtensionContext.md#registereditor); not to be confused with
[ExtensionContext.editors](ExtensionContext.md#editors) (the document/tab model).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:152](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L152)

Unique id, conventionally namespaced (e.g. `"core.text-editor"`).

***

### label?

```ts
optional label?: string;
```

Defined in: [packages/sdk/src/types.ts:159](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L159)

Human-facing name of this *view* of a file, e.g. `"Text"` or `"Preview"`.
Surfaces in the breadcrumb view-switcher and the explorer "Open With" menu
when more than one editor matches a file. Defaults to [Editor.id](#id)
where a label is needed but none is given.

***

### match

```ts
match: (path) => boolean;
```

Defined in: [packages/sdk/src/types.ts:161](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L161)

Returns true if this editor should handle the given path (`null` = untitled).

#### Parameters

##### path

`string` \| `null`

#### Returns

`boolean`

***

### component

```ts
component: ComponentType<EditorProps>;
```

Defined in: [packages/sdk/src/types.ts:163](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L163)

The React component rendered for matched tabs.

***

### priority?

```ts
optional priority?: number;
```

Defined in: [packages/sdk/src/types.ts:172](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L172)

Higher wins when multiple editors match the same file. Defaults to 0. On a
tie the first-registered editor wins — so a second editor for a type can
deliberately be an *alternate* (not the default) by matching the
incumbent's priority rather than exceeding it. Users still pick any matching
view per-tab via "Open With" / the view-switcher
([OpenFileOptions.viewType](OpenFileOptions.md#viewtype)).

***

### capabilities?

```ts
optional capabilities?: EditorCapabilities;
```

Defined in: [packages/sdk/src/types.ts:174](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L174)

Optional routing hints — see [EditorCapabilities](EditorCapabilities.md).

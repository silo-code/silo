# Interface: EditorViewInfo

Defined in: [packages/sdk/src/editor-service.ts:58](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L58)

One editor view that can render a given file — its id, user-facing label, and
whether it is the view the host would pick by default. Returned by
[EditorService.editorsFor](EditorService.md#editorsfor); used to build "Open With" menus and the
breadcrumb view-switcher.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/editor-service.ts:60](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L60)

The editor's id (an [Editor.id](Editor.md#id)); pass back as `viewType`.

***

### label

```ts
label: string;
```

Defined in: [packages/sdk/src/editor-service.ts:62](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L62)

Human-facing label (falls back to [EditorViewInfo.id](#id)).

***

### isDefault

```ts
isDefault: boolean;
```

Defined in: [packages/sdk/src/editor-service.ts:64](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L64)

True for the editor the host resolves by default (highest priority).

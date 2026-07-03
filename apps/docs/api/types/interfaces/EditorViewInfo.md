# Interface: EditorViewInfo

Defined in: [packages/sdk/src/editor-service.ts:61](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L61)

One editor view that can render a given file — its id, user-facing label, and
whether it is the view the host would pick by default. Returned by
[EditorService.editorsFor](EditorService.md#editorsfor); used to build "Open With" menus and the
breadcrumb view-switcher.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/editor-service.ts:63](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L63)

The editor's id (an [Editor.id](Editor.md#id)); pass back as `viewType`.

***

### label

```ts
label: string;
```

Defined in: [packages/sdk/src/editor-service.ts:65](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L65)

Human-facing label (falls back to [EditorViewInfo.id](#id)).

***

### isDefault

```ts
isDefault: boolean;
```

Defined in: [packages/sdk/src/editor-service.ts:67](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L67)

True for the editor the host resolves by default (highest priority).

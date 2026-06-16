# Interface: EditorProps

Defined in: [packages/sdk/src/types.ts:67](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L67)

Props passed to an [Editor](Editor.md) component. An editor renders the contents of
one editor tab (a presenter for a file type — distinct from
[ExtensionContext.editors](ExtensionContext.md#editors), which is the document model).

## Properties

### editorId

```ts
editorId: string;
```

Defined in: [packages/sdk/src/types.ts:69](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L69)

Stable id of the editor tab this editor instance is rendering.

***

### filePath

```ts
filePath: string | null;
```

Defined in: [packages/sdk/src/types.ts:71](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L71)

Absolute path of the file, or `null` for an untitled buffer.

***

### dockApi

```ts
dockApi: DockviewPanelApi;
```

Defined in: [packages/sdk/src/types.ts:73](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L73)

Handle to the surrounding dock panel (title, close, focus).

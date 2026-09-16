# Interface: EditorProps

Defined in: [packages/sdk/src/types.ts:254](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L254)

Props passed to an [Editor](Editor.md) component. An editor renders the contents of
one editor tab (a presenter for a file type — distinct from
[ExtensionContext.editors](ExtensionContext.md#editors), which is the document model).

## Properties

### editorId

```ts
editorId: string;
```

Defined in: [packages/sdk/src/types.ts:256](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L256)

Stable id of the editor tab this editor instance is rendering.

***

### filePath

```ts
filePath: string | null;
```

Defined in: [packages/sdk/src/types.ts:258](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L258)

Absolute path of the file, or `null` for an untitled buffer.

***

### dockApi

```ts
dockApi: DockPanelApi;
```

Defined in: [packages/sdk/src/types.ts:260](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L260)

Handle to the surrounding dock panel (title, close, focus).

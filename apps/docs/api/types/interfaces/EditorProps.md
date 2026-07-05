# Interface: EditorProps

Defined in: [packages/sdk/src/types.ts:136](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L136)

Props passed to an [Editor](Editor.md) component. An editor renders the contents of
one editor tab (a presenter for a file type — distinct from
[ExtensionContext.editors](ExtensionContext.md#editors), which is the document model).

## Properties

### editorId

```ts
editorId: string;
```

Defined in: [packages/sdk/src/types.ts:138](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L138)

Stable id of the editor tab this editor instance is rendering.

***

### filePath

```ts
filePath: string | null;
```

Defined in: [packages/sdk/src/types.ts:140](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L140)

Absolute path of the file, or `null` for an untitled buffer.

***

### dockApi

```ts
dockApi: DockPanelApi;
```

Defined in: [packages/sdk/src/types.ts:142](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L142)

Handle to the surrounding dock panel (title, close, focus).

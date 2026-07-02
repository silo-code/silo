# Interface: EditorProps

Defined in: [packages/sdk/src/types.ts:129](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L129)

Props passed to an [Editor](Editor.md) component. An editor renders the contents of
one editor tab (a presenter for a file type — distinct from
[ExtensionContext.editors](ExtensionContext.md#editors), which is the document model).

## Properties

### editorId

```ts
editorId: string;
```

Defined in: [packages/sdk/src/types.ts:131](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L131)

Stable id of the editor tab this editor instance is rendering.

***

### filePath

```ts
filePath: string | null;
```

Defined in: [packages/sdk/src/types.ts:133](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L133)

Absolute path of the file, or `null` for an untitled buffer.

***

### dockApi

```ts
dockApi: DockPanelApi;
```

Defined in: [packages/sdk/src/types.ts:135](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L135)

Handle to the surrounding dock panel (title, close, focus).

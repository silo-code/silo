# Interface: EditorSaveHandlers

Defined in: [packages/sdk/src/editor-service.ts:57](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L57)

Save callbacks an editor viewer registers via
[EditorService.registerSaveHandler](EditorService.md#registersavehandler), so the active-editor `save` /
`saveAs` commands can dispatch to whichever editor is focused.

## Properties

### save

```ts
save: () => void | Promise<void>;
```

Defined in: [packages/sdk/src/editor-service.ts:59](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L59)

Save the editor's contents.

#### Returns

`void` \| `Promise`\<`void`\>

***

### saveAs?

```ts
optional saveAs?: () => void | Promise<void>;
```

Defined in: [packages/sdk/src/editor-service.ts:61](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L61)

Save-as (prompt for a new path). Optional.

#### Returns

`void` \| `Promise`\<`void`\>

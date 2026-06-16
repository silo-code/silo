# Interface: EditorSaveHandlers

Defined in: [packages/sdk/src/editor-service.ts:75](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L75)

Save callbacks an editor viewer registers via
[EditorService.registerSaveHandler](EditorService.md#registersavehandler), so the active-editor `save` /
`saveAs` commands can dispatch to whichever editor is focused.

## Properties

### save

```ts
save: () => void | Promise<void>;
```

Defined in: [packages/sdk/src/editor-service.ts:77](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L77)

Save the editor's contents.

#### Returns

`void` \| `Promise`\<`void`\>

***

### saveAs?

```ts
optional saveAs?: () => void | Promise<void>;
```

Defined in: [packages/sdk/src/editor-service.ts:79](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L79)

Save-as (prompt for a new path). Optional.

#### Returns

`void` \| `Promise`\<`void`\>

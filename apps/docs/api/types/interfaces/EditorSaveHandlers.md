# Interface: EditorSaveHandlers

Defined in: [packages/sdk/src/editor-service.ts:79](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L79)

Save callbacks an editor registers via
[EditorService.registerSaveHandler](EditorService.md#registersavehandler), so the active-editor `save` /
`saveAs` commands can dispatch to whichever editor is focused.

## Properties

### save

```ts
save: () => void | Promise<void>;
```

Defined in: [packages/sdk/src/editor-service.ts:81](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L81)

Save the editor's contents.

#### Returns

`void` \| `Promise`\<`void`\>

***

### saveAs?

```ts
optional saveAs?: () => void | Promise<void>;
```

Defined in: [packages/sdk/src/editor-service.ts:83](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L83)

Save-as (prompt for a new path). Optional.

#### Returns

`void` \| `Promise`\<`void`\>

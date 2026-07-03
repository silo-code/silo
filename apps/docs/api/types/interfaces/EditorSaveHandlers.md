# Interface: EditorSaveHandlers

Defined in: [packages/sdk/src/editor-service.ts:78](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L78)

Save callbacks an editor registers via
[EditorService.registerSaveHandler](EditorService.md#registersavehandler), so the active-editor `save` /
`saveAs` commands can dispatch to whichever editor is focused.

## Properties

### save

```ts
save: () => void | Promise<void>;
```

Defined in: [packages/sdk/src/editor-service.ts:80](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L80)

Save the editor's contents.

#### Returns

`void` \| `Promise`\<`void`\>

***

### saveAs?

```ts
optional saveAs?: () => void | Promise<void>;
```

Defined in: [packages/sdk/src/editor-service.ts:82](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L82)

Save-as (prompt for a new path). Optional.

#### Returns

`void` \| `Promise`\<`void`\>

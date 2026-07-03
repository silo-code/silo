# Interface: EditorSaveEvent

Defined in: [packages/sdk/src/editor-service.ts:206](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L206)

Payload delivered to [EditorService.onDidSave](EditorService.md#ondidsave) listeners after an
editor tab's contents are written to disk.

## Properties

### editorId

```ts
editorId: string;
```

Defined in: [packages/sdk/src/editor-service.ts:208](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L208)

The saved tab's editor record id — matches [EditorRecord.id](EditorRecord.md#id).

***

### filePath

```ts
filePath: string;
```

Defined in: [packages/sdk/src/editor-service.ts:213](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L213)

Absolute path the contents were written to. For a save-as (or first save
of an untitled buffer) this is the newly chosen path, not the old one.

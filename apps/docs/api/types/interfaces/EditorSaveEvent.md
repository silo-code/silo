# Interface: EditorSaveEvent

Defined in: [packages/sdk/src/editor-service.ts:212](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L212)

Payload delivered to [EditorService.onDidSave](EditorService.md#ondidsave) listeners after an
editor tab's contents are written to disk.

## Properties

### editorId

```ts
editorId: string;
```

Defined in: [packages/sdk/src/editor-service.ts:214](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L214)

The saved tab's editor record id — matches [EditorRecord.id](EditorRecord.md#id).

***

### filePath

```ts
filePath: string;
```

Defined in: [packages/sdk/src/editor-service.ts:219](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L219)

Absolute path the contents were written to. For a save-as (or first save
of an untitled buffer) this is the newly chosen path, not the old one.

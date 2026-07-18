# Interface: ActiveEditorInfo

Defined in: [packages/sdk/src/editor-service.ts:163](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L163)

A point-in-time snapshot of the focused editor tab. Part of
[EditorsState](EditorsState.md), returned by [EditorService.getState](EditorService.md#getstate) and
delivered to [EditorService.subscribe](EditorService.md#subscribe) listeners.

## Properties

### editorId

```ts
editorId: string;
```

Defined in: [packages/sdk/src/editor-service.ts:165](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L165)

The focused editor tab's record id — matches [EditorRecord.id](EditorRecord.md#id).

***

### filePath

```ts
filePath: string | null;
```

Defined in: [packages/sdk/src/editor-service.ts:170](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L170)

The absolute file path of the focused tab, or `null` for an untitled
buffer.

***

### viewId

```ts
viewId: string;
```

Defined in: [packages/sdk/src/editor-service.ts:177](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L177)

The [Editor.id](Editor.md#id) of the presenter rendering the tab
(e.g. `"core.text-editor"`, `"silo.markdown-preview"`). Empty string
when the presenter could not be resolved (rare: editor registered after
the tab was opened).

***

### mode

```ts
mode: EditorMode;
```

Defined in: [packages/sdk/src/editor-service.ts:179](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L179)

Whether the tab is in text or diff mode.

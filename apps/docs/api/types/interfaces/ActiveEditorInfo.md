# Interface: ActiveEditorInfo

Defined in: [packages/sdk/src/editor-service.ts:164](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L164)

A point-in-time snapshot of the focused editor tab. Part of
[EditorsState](EditorsState.md), returned by [EditorService.getState](EditorService.md#getstate) and
delivered to [EditorService.subscribe](EditorService.md#subscribe) listeners.

## Properties

### editorId

```ts
editorId: string;
```

Defined in: [packages/sdk/src/editor-service.ts:166](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L166)

The focused editor tab's record id — matches [EditorRecord.id](EditorRecord.md#id).

***

### filePath

```ts
filePath: string | null;
```

Defined in: [packages/sdk/src/editor-service.ts:171](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L171)

The absolute file path of the focused tab, or `null` for an untitled
buffer.

***

### viewId

```ts
viewId: string;
```

Defined in: [packages/sdk/src/editor-service.ts:178](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L178)

The [Editor.id](Editor.md#id) of the presenter rendering the tab
(e.g. `"core.text-editor"`, `"silo.markdown-preview"`). Empty string
when the presenter could not be resolved (rare: editor registered after
the tab was opened).

***

### mode

```ts
mode: EditorMode;
```

Defined in: [packages/sdk/src/editor-service.ts:180](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L180)

Whether the tab is in text or diff mode.

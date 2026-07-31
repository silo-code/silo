# Interface: OpenFileOptions

Defined in: [packages/sdk/src/editor-service.ts:17](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L17)

Options for the editor open methods.

## Properties

### workspaceId?

```ts
optional workspaceId?: string;
```

Defined in: [packages/sdk/src/editor-service.ts:19](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L19)

Target workspace. Defaults to the active workspace.

***

### preview?

```ts
optional preview?: boolean;
```

Defined in: [packages/sdk/src/editor-service.ts:24](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L24)

Open as a preview tab (single-click style — replaced by the next preview,
italic title) instead of a permanent editor. Defaults to false.

***

### viewType?

```ts
optional viewType?: string;
```

Defined in: [packages/sdk/src/editor-service.ts:32](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L32)

Open with a specific editor view — an [Editor.id](Editor.md#id), e.g. from an
"Open With" menu. Persisted on the tab as [EditorRecord.viewType](EditorRecord.md#viewtype).
Ignored if no registered editor with that id matches the path (the host
falls back to the highest-priority match). When omitted the default view is
used and any existing tab's view is left unchanged.

***

### selection?

```ts
optional selection?: object;
```

Defined in: [packages/sdk/src/editor-service.ts:41](https://github.com/silo-code/silo/blob/main/packages/sdk/src/editor-service.ts#L41)

Reveal and select a range when the editor opens — used to jump to a search
match or a definition. Applied whether the tab is newly opened or already
open (re-jumps an existing tab). All positions are **1-indexed**; `column`
defaults to 1, and an omitted `endLine`/`endColumn` collapses the selection
to a caret (just scrolls the line into view). Best-effort: editor views that
can't honor a selection ignore it.

#### line

```ts
line: number;
```

1-indexed start line.

#### column?

```ts
optional column?: number;
```

1-indexed start column. Defaults to 1.

#### endLine?

```ts
optional endLine?: number;
```

1-indexed end line. Defaults to `line`.

#### endColumn?

```ts
optional endColumn?: number;
```

1-indexed end column. Defaults to `column`.

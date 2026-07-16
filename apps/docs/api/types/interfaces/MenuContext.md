# Interface: MenuContext

Defined in: [packages/sdk/src/types.ts:345](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L345)

The typed **context object** each [MenuSurface](../type-aliases/MenuSurface.md) passes to an invoked
command (as its first argument) and to the contribution's
[when](ContextMenuContribution.md#when) /
[checked](ContextMenuContribution.md#checked) predicates. The contract
is per-surface and closed: a flat, serializable object — never a DOM event
or host component internals.

The `"workspace"` surface is unique in passing the full [Workspace](Workspace.md)
rather than a lightweight derived object — workspace actions typically need
the workspace's metadata (id, folder, name) wholesale.

## Properties

### explorer/item

```ts
explorer/item: object;
```

Defined in: [packages/sdk/src/types.ts:346](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L346)

#### path

```ts
path: string;
```

#### isDir

```ts
isDir: boolean;
```

#### workspaceId

```ts
workspaceId: string;
```

***

### editor/tab

```ts
editor/tab: object;
```

Defined in: [packages/sdk/src/types.ts:347](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L347)

#### editorId

```ts
editorId: string;
```

#### filePath

```ts
filePath: string | null;
```

#### viewId

```ts
viewId: string;
```

***

### terminal/tab

```ts
terminal/tab: object;
```

Defined in: [packages/sdk/src/types.ts:348](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L348)

#### terminalId

```ts
terminalId: string;
```

#### workspaceId

```ts
workspaceId: string;
```

***

### workspace

```ts
workspace: Workspace;
```

Defined in: [packages/sdk/src/types.ts:349](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L349)

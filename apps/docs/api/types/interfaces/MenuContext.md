# Interface: MenuContext

Defined in: [packages/sdk/src/types.ts:363](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L363)

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

Defined in: [packages/sdk/src/types.ts:364](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L364)

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

Defined in: [packages/sdk/src/types.ts:365](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L365)

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

Defined in: [packages/sdk/src/types.ts:366](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L366)

#### terminalId

```ts
terminalId: string;
```

#### workspaceId

```ts
workspaceId: string;
```

***

### terminal/link

```ts
terminal/link: object;
```

Defined in: [packages/sdk/src/types.ts:374](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L374)

The right-clicked link's kind (`"url"` for OSC-8/`WebLinksAddon`-detected
links, `"path"` for Silo's own file-path provider) and its literal text
(the URL or path string), alongside which terminal it was found in. See
[ADR 0027](https://github.com/silo-code/silo/blob/main/docs/decisions/0027-terminal-link-policy.md)
for the shared link contract this surface hooks into.

#### terminalId

```ts
terminalId: string;
```

#### kind

```ts
kind: "url" | "path";
```

#### text

```ts
text: string;
```

***

### workspace

```ts
workspace: Workspace;
```

Defined in: [packages/sdk/src/types.ts:375](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L375)

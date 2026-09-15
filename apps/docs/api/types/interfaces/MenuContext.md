# Interface: MenuContext

Defined in: [packages/sdk/src/types.ts:447](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L447)

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

Defined in: [packages/sdk/src/types.ts:448](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L448)

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

Defined in: [packages/sdk/src/types.ts:449](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L449)

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

Defined in: [packages/sdk/src/types.ts:450](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L450)

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

Defined in: [packages/sdk/src/types.ts:458](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L458)

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

### panel/tab

```ts
panel/tab: object;
```

Defined in: [packages/sdk/src/types.ts:472](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L472)

A dock panel's tab, of **any** [DockPanelKind](DockPanelKind.md) — the bundled Chat
transcript, a web viewer, your own panel. Field-for-field the same shape as
a panel toolbar item's target (`ToolbarItemContext["panel"]`), because both
describe the same thing.

There is no per-kind surface: an item registered here appears on *every*
panel tab unless it scopes itself, exactly as a `surface: "panel"` toolbar
item does — `when: (_keys, t) => t.kindId === "silo.agents-chat-panel"`.
Instance state arrives as [the panel's params](DockPanelRecord.md#state).

`params` is a copy taken when the menu opened; mutating it changes nothing.

#### panelId

```ts
panelId: string;
```

#### kindId

```ts
kindId: string;
```

#### workspaceId

```ts
workspaceId: string;
```

#### params

```ts
params: Readonly<Record<string, unknown>>;
```

***

### workspace

```ts
workspace: Workspace;
```

Defined in: [packages/sdk/src/types.ts:478](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L478)

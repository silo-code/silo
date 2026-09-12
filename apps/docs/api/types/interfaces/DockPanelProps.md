# Interface: DockPanelProps\<T\>

Defined in: [packages/sdk/src/types.ts:171](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L171)

Props handed to a [DockPanelKind](DockPanelKind.md) component. Use this type to annotate
your component instead of importing from the underlying dock framework
directly — the SDK owns this surface so extensions remain insulated from
host implementation details. The optional generic `T` narrows `params`.

## Type Parameters

### T

`T` *extends* `object` = `Record`\<`string`, `unknown`\>

## Properties

### api

```ts
api: DockPanelApi;
```

Defined in: [packages/sdk/src/types.ts:173](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L173)

The panel API — drives the tab (title, close, focus, params).

***

### params

```ts
params: T;
```

Defined in: [packages/sdk/src/types.ts:175](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L175)

Serializable parameters forwarded to the panel at open time.

***

### workspaceId

```ts
workspaceId: string;
```

Defined in: [packages/sdk/src/types.ts:188](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L188)

The workspace this panel lives in.

**Not** the same as "the active workspace": every open workspace keeps its
dock mounted, so a background panel can be doing work while the user is
somewhere else. Anything a panel reports about itself — an Agent Session it
connects (`ctx.agents.sessions.connect({ workspaceId })`), a file it opens —
belongs to *this* workspace, and reading `ctx.workspaces` for it instead
files the result wherever the user happened to be standing. Caught live
(2026-09-10): a Chat session moved workspaces mid-session because its
`connect()` defaulted to the active one.

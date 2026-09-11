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

***

### onScreen

```ts
onScreen: boolean;
```

Defined in: [packages/sdk/src/types.ts:211](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L211)

Whether this panel's pixels are actually on screen right now — its tab is
the selected one in its group **and** its workspace is the one the user is
looking at. The host resolves both halves; a panel must not reconstruct
this from [DockPanelApi.isVisible](DockPanelApi.md#isvisible) plus
[ExtensionContext.workspaces](ExtensionContext.md#workspaces) itself.

Distinct from the two api members it is easy to confuse it with.
[DockPanelApi.isVisible](DockPanelApi.md#isvisible) covers only the tab half, so a panel in a
background workspace still reports `isVisible: true`;
[DockPanelApi.isActive](DockPanelApi.md#isactive) is about focus — the single panel in the
whole dock that has it.

A panel is **never unmounted** for going off screen, which is what makes
this prop load-bearing rather than a convenience. A deselected tab has its
DOM detached and later re-attached — discarding scroll offsets and
anything else the browser keeps on a layout box — while its React state
and refs survive untouched, and a background workspace's dock stays in the
tree as it was. So whatever a panel measures from or restores into the DOM
belongs on a transition of this flag, never on mount: mount happens once,
when the tab is created, and never again.

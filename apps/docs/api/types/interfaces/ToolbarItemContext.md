# Interface: ToolbarItemContext

Defined in: [packages/sdk/src/toolbar-items.ts:36](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L36)

The typed target each [ToolbarSurface](../type-aliases/ToolbarSurface.md) passes to an invoked command
and to `when` / `checked` / [ToolbarMenuItemContribution.menu](ToolbarMenuItemContribution.md#menu) builders.

## Properties

### editor

```ts
editor: object;
```

Defined in: [packages/sdk/src/toolbar-items.ts:37](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L37)

#### editorId

```ts
editorId: string;
```

***

### navigator

```ts
navigator: object;
```

Defined in: [packages/sdk/src/toolbar-items.ts:38](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L38)

#### viewId

```ts
viewId: string;
```

***

### panel

```ts
panel: object;
```

Defined in: [packages/sdk/src/toolbar-items.ts:45](https://github.com/silo-code/silo/blob/main/packages/sdk/src/toolbar-items.ts#L45)

`panelId` and `kindId` identify the panel; `params` is the panel's own
serialized parameters (`DockPanelProps["params"]`) — read-only, so an item
can key on instance data (e.g. the terminal's `params.terminalId`) without
a lookup the SDK does not offer.

#### panelId

```ts
panelId: string;
```

#### kindId

```ts
kindId: string;
```

#### params

```ts
params: Readonly<Record<string, unknown>>;
```

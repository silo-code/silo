# Interface: NavigatorView

Defined in: [packages/sdk/src/types.ts:560](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L560)

A view in the **Navigator** — the side panel you navigate the app from. The
Navigator is a container: each registered view is one projection of "where
can I go". Every registered view is listed by name at the top of the panel
and is one click away; the built-in **Workspaces** view (the workspace list)
is itself registered this way, through this same API.

Reach for a view rather than [ExtensionContext.registerSidePanel](ExtensionContext.md#registersidepanel) when
what you'd be adding is *another way to navigate the app*. Two navigators
side by side leave the user with no rule for which one to trust; a view keeps
one place to navigate from and changes only how it is projected.

Register **one** view per projection, not one per way of sorting it — a
grouping or filter your view supports is a control *inside* that view
(contribute it as a toolbar item, see below), not a second entry in the list.

A view owns the whole panel body. Header **actions** are contributed
separately, as toolbar items on the `"navigator"`
[ToolbarSurface](../type-aliases/ToolbarSurface.md) — that way an action can be scoped to one view (via
`when`) or shown across all of them, and it gets the host's button and
dropdown chrome for free.

## Example

```tsx
ctx.registerNavigatorView({
  id: "my-ext.agents",
  title: "Agents",
  component: ({ active, panelId }) => (
    <AgentList paused={!active} panelId={panelId} />
  ),
});
```

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:562](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L562)

Unique id, conventionally `"<extension-id>.<view-name>"`.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:564](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L564)

Name shown for this view in the Navigator's view list.

***

### icon?

```ts
optional icon?: ReactNode;
```

Defined in: [packages/sdk/src/types.ts:566](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L566)

Optional icon rendered to the left of the title in the view list.

***

### component

```ts
component: ComponentType<NavigatorViewProps>;
```

Defined in: [packages/sdk/src/types.ts:568](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L568)

The React component rendered as the whole panel body when active.

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:573](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L573)

Sort order among views. Lower values appear first in the view list.
Defaults to `0`; the built-in Workspaces view registers at `0`.

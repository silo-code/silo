# Interface: NavigatorView

Defined in: [packages/sdk/src/types.ts:525](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L525)

A view in the **Navigator** — the side panel you navigate the app from. The
Navigator is a container: each registered view is one projection of "where
can I go", and the user switches between them from the selector in its
header. The built-in **Workspaces** view (the workspace list) is itself
registered this way, through this same API.

Reach for a view rather than [ExtensionContext.registerSidePanel](ExtensionContext.md#registersidepanel) when
what you'd be adding is *another way to navigate the app*. Two navigators
side by side leave the user with no rule for which one to trust; a view keeps
one place to navigate from and changes only how it is projected.

A view owns the whole panel body. Header **actions** are contributed
separately, as toolbar items on the `"navigator"`
[ToolbarSurface](../type-aliases/ToolbarSurface.md) — that way an action can be scoped to one view (via
`when`) or shown across all of them, and it gets the host's button and
dropdown chrome for free.

## Example

```tsx
ctx.registerNavigatorView({
  id: "my-ext.by-status",
  title: "Agents by status",
  component: ({ active }) => <AgentList paused={!active} />,
});
```

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:527](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L527)

Unique id, conventionally `"<extension-id>.<view-name>"`.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:529](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L529)

Name shown in the Navigator's header and its view menu.

***

### icon?

```ts
optional icon?: ReactNode;
```

Defined in: [packages/sdk/src/types.ts:531](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L531)

Optional icon rendered to the left of the title in the view menu.

***

### component

```ts
component: ComponentType<NavigatorViewProps>;
```

Defined in: [packages/sdk/src/types.ts:533](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L533)

The React component rendered as the whole panel body when active.

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:538](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L538)

Sort order among views. Lower values appear first in the view menu.
Defaults to `0`; the built-in Workspaces view registers at `0`.

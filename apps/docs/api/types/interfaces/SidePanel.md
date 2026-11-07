# Interface: SidePanel

Defined in: [packages/sdk/src/types.ts:625](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L625)

A panel mounted in the left or right side column (e.g. file explorer, git).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:627](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L627)

Unique id, conventionally namespaced.

***

### location

```ts
location: "left" | "right";
```

Defined in: [packages/sdk/src/types.ts:629](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L629)

Which side column to mount in.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:631](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L631)

Title shown in the column's panel switcher.

***

### icon?

```ts
optional icon?: ReactNode;
```

Defined in: [packages/sdk/src/types.ts:660](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L660)

Optional identity artwork for this panel's SideDock tab.

The house convention is a Phosphor icon at `weight="duotone" size="1em"`,
which matches the two-tone glyphs used by the Navigator view list and the
Workspaces surfaces. `em` sizing matters: it keeps the icon tracking the
user's UI font size. A hand-authored inline SVG is fine when no Phosphor
glyph fits — use `currentColor` so it themes with the tab, and layer it at
two opacities to stay in the same visual family.

Supplying an icon does not mean it is shown. The **user** picks per tab
whether it renders the icon, the title, or both (see
[SidePanelTabDisplay](../type-aliases/SidePanelTabDisplay.md)), and the default is title-only — so always
give this panel a meaningful [SidePanel.title](#title) as well.

#### Example

```tsx
import { GitBranch } from "@phosphor-icons/react";

ctx.registerSidePanel({
  id: "git-explorer",
  location: "right",
  title: "Git",
  icon: <GitBranch size="1em" weight="duotone" />,
  component: GitPanel,
});
```

***

### component

```ts
component: ComponentType<SidePanelProps>;
```

Defined in: [packages/sdk/src/types.ts:662](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L662)

The React component; receives [SidePanelProps](SidePanelProps.md).

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:664](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L664)

Sort order within the side column. Defaults to 0.

***

### lazyMount?

```ts
optional lazyMount?: boolean;
```

Defined in: [packages/sdk/src/types.ts:670](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L670)

If true, defer mounting the component until the first time this panel
becomes active. Once mounted, stays mounted (panel can use `active`
to pause expensive work when hidden).

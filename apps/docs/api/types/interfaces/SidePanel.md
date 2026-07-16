# Interface: SidePanel

Defined in: [packages/sdk/src/types.ts:447](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L447)

A panel mounted in the left or right side column (e.g. file explorer, git).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:449](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L449)

Unique id, conventionally namespaced.

***

### location

```ts
location: "left" | "right";
```

Defined in: [packages/sdk/src/types.ts:451](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L451)

Which side column to mount in.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:453](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L453)

Title shown in the column's panel switcher.

***

### component

```ts
component: ComponentType<SidePanelProps>;
```

Defined in: [packages/sdk/src/types.ts:455](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L455)

The React component; receives [SidePanelProps](SidePanelProps.md).

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:457](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L457)

Sort order within the side column. Defaults to 0.

***

### lazyMount?

```ts
optional lazyMount?: boolean;
```

Defined in: [packages/sdk/src/types.ts:463](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L463)

If true, defer mounting the component until the first time this panel
becomes active. Once mounted, stays mounted (panel can use `active`
to pause expensive work when hidden).

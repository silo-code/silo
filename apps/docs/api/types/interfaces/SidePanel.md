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

### component

```ts
component: ComponentType<SidePanelProps>;
```

Defined in: [packages/sdk/src/types.ts:633](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L633)

The React component; receives [SidePanelProps](SidePanelProps.md).

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:635](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L635)

Sort order within the side column. Defaults to 0.

***

### lazyMount?

```ts
optional lazyMount?: boolean;
```

Defined in: [packages/sdk/src/types.ts:641](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L641)

If true, defer mounting the component until the first time this panel
becomes active. Once mounted, stays mounted (panel can use `active`
to pause expensive work when hidden).

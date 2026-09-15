# Interface: SidePanel

Defined in: [packages/sdk/src/types.ts:584](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L584)

A panel mounted in the left or right side column (e.g. file explorer, git).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:586](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L586)

Unique id, conventionally namespaced.

***

### location

```ts
location: "left" | "right";
```

Defined in: [packages/sdk/src/types.ts:588](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L588)

Which side column to mount in.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:590](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L590)

Title shown in the column's panel switcher.

***

### component

```ts
component: ComponentType<SidePanelProps>;
```

Defined in: [packages/sdk/src/types.ts:592](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L592)

The React component; receives [SidePanelProps](SidePanelProps.md).

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:594](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L594)

Sort order within the side column. Defaults to 0.

***

### lazyMount?

```ts
optional lazyMount?: boolean;
```

Defined in: [packages/sdk/src/types.ts:600](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L600)

If true, defer mounting the component until the first time this panel
becomes active. Once mounted, stays mounted (panel can use `active`
to pause expensive work when hidden).

# Interface: SidePanel

Defined in: [packages/sdk/src/types.ts:528](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L528)

A panel mounted in the left or right side column (e.g. file explorer, git).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:530](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L530)

Unique id, conventionally namespaced.

***

### location

```ts
location: "left" | "right";
```

Defined in: [packages/sdk/src/types.ts:532](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L532)

Which side column to mount in.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:534](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L534)

Title shown in the column's panel switcher.

***

### component

```ts
component: ComponentType<SidePanelProps>;
```

Defined in: [packages/sdk/src/types.ts:536](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L536)

The React component; receives [SidePanelProps](SidePanelProps.md).

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:538](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L538)

Sort order within the side column. Defaults to 0.

***

### lazyMount?

```ts
optional lazyMount?: boolean;
```

Defined in: [packages/sdk/src/types.ts:544](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L544)

If true, defer mounting the component until the first time this panel
becomes active. Once mounted, stays mounted (panel can use `active`
to pause expensive work when hidden).

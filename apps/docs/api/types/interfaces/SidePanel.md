# Interface: SidePanel

Defined in: [packages/sdk/src/types.ts:364](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L364)

A panel mounted in the left or right side column (e.g. file explorer, git).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:366](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L366)

Unique id, conventionally namespaced.

***

### location

```ts
location: "left" | "right";
```

Defined in: [packages/sdk/src/types.ts:368](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L368)

Which side column to mount in.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:370](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L370)

Title shown in the column's panel switcher.

***

### component

```ts
component: ComponentType<SidePanelProps>;
```

Defined in: [packages/sdk/src/types.ts:372](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L372)

The React component; receives [SidePanelProps](SidePanelProps.md).

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:374](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L374)

Sort order within the side column. Defaults to 0.

***

### lazyMount?

```ts
optional lazyMount?: boolean;
```

Defined in: [packages/sdk/src/types.ts:380](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L380)

If true, defer mounting the component until the first time this panel
becomes active. Once mounted, stays mounted (panel can use `active`
to pause expensive work when hidden).

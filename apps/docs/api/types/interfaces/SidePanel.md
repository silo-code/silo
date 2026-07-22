# Interface: SidePanel

Defined in: [packages/sdk/src/types.ts:458](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L458)

A panel mounted in the left or right side column (e.g. file explorer, git).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:460](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L460)

Unique id, conventionally namespaced.

***

### location

```ts
location: "left" | "right";
```

Defined in: [packages/sdk/src/types.ts:462](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L462)

Which side column to mount in.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:464](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L464)

Title shown in the column's panel switcher.

***

### component

```ts
component: ComponentType<SidePanelProps>;
```

Defined in: [packages/sdk/src/types.ts:466](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L466)

The React component; receives [SidePanelProps](SidePanelProps.md).

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:468](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L468)

Sort order within the side column. Defaults to 0.

***

### lazyMount?

```ts
optional lazyMount?: boolean;
```

Defined in: [packages/sdk/src/types.ts:474](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L474)

If true, defer mounting the component until the first time this panel
becomes active. Once mounted, stays mounted (panel can use `active`
to pause expensive work when hidden).

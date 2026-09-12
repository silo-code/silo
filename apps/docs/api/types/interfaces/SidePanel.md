# Interface: SidePanel

Defined in: [packages/sdk/src/types.ts:541](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L541)

A panel mounted in the left or right side column (e.g. file explorer, git).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:543](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L543)

Unique id, conventionally namespaced.

***

### location

```ts
location: "left" | "right";
```

Defined in: [packages/sdk/src/types.ts:545](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L545)

Which side column to mount in.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:547](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L547)

Title shown in the column's panel switcher.

***

### component

```ts
component: ComponentType<SidePanelProps>;
```

Defined in: [packages/sdk/src/types.ts:549](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L549)

The React component; receives [SidePanelProps](SidePanelProps.md).

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:551](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L551)

Sort order within the side column. Defaults to 0.

***

### lazyMount?

```ts
optional lazyMount?: boolean;
```

Defined in: [packages/sdk/src/types.ts:557](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L557)

If true, defer mounting the component until the first time this panel
becomes active. Once mounted, stays mounted (panel can use `active`
to pause expensive work when hidden).

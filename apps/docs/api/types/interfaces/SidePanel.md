# Interface: SidePanel

Defined in: [packages/sdk/src/types.ts:339](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L339)

A panel mounted in the left or right side column (e.g. file explorer, git).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:341](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L341)

Unique id, conventionally namespaced.

***

### location

```ts
location: "left" | "right";
```

Defined in: [packages/sdk/src/types.ts:343](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L343)

Which side column to mount in.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:345](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L345)

Title shown in the column's panel switcher.

***

### component

```ts
component: ComponentType<SidePanelProps>;
```

Defined in: [packages/sdk/src/types.ts:347](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L347)

The React component; receives [SidePanelProps](SidePanelProps.md).

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:349](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L349)

Sort order within the side column. Defaults to 0.

***

### lazyMount?

```ts
optional lazyMount?: boolean;
```

Defined in: [packages/sdk/src/types.ts:355](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L355)

If true, defer mounting the component until the first time this panel
becomes active. Once mounted, stays mounted (panel can use `active`
to pause expensive work when hidden).

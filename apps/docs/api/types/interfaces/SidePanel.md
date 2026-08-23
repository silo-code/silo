# Interface: SidePanel

Defined in: [packages/sdk/src/types.ts:482](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L482)

A panel mounted in the left or right side column (e.g. file explorer, git).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:484](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L484)

Unique id, conventionally namespaced.

***

### location

```ts
location: "left" | "right";
```

Defined in: [packages/sdk/src/types.ts:486](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L486)

Which side column to mount in.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:488](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L488)

Title shown in the column's panel switcher.

***

### component

```ts
component: ComponentType<SidePanelProps>;
```

Defined in: [packages/sdk/src/types.ts:490](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L490)

The React component; receives [SidePanelProps](SidePanelProps.md).

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:492](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L492)

Sort order within the side column. Defaults to 0.

***

### lazyMount?

```ts
optional lazyMount?: boolean;
```

Defined in: [packages/sdk/src/types.ts:498](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L498)

If true, defer mounting the component until the first time this panel
becomes active. Once mounted, stays mounted (panel can use `active`
to pause expensive work when hidden).

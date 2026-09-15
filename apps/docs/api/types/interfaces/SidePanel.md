# Interface: SidePanel

Defined in: [packages/sdk/src/types.ts:585](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L585)

A panel mounted in the left or right side column (e.g. file explorer, git).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:587](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L587)

Unique id, conventionally namespaced.

***

### location

```ts
location: "left" | "right";
```

Defined in: [packages/sdk/src/types.ts:589](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L589)

Which side column to mount in.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:591](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L591)

Title shown in the column's panel switcher.

***

### component

```ts
component: ComponentType<SidePanelProps>;
```

Defined in: [packages/sdk/src/types.ts:593](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L593)

The React component; receives [SidePanelProps](SidePanelProps.md).

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:595](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L595)

Sort order within the side column. Defaults to 0.

***

### lazyMount?

```ts
optional lazyMount?: boolean;
```

Defined in: [packages/sdk/src/types.ts:601](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L601)

If true, defer mounting the component until the first time this panel
becomes active. Once mounted, stays mounted (panel can use `active`
to pause expensive work when hidden).

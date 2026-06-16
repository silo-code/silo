# Interface: SidePanel

Defined in: [packages/sdk/src/types.ts:277](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L277)

A panel mounted in the left or right side column (e.g. file explorer, git).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:279](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L279)

Unique id, conventionally namespaced.

***

### location

```ts
location: "left" | "right";
```

Defined in: [packages/sdk/src/types.ts:281](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L281)

Which side column to mount in.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:283](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L283)

Title shown in the column's panel switcher.

***

### component

```ts
component: ComponentType<SidePanelProps>;
```

Defined in: [packages/sdk/src/types.ts:285](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L285)

The React component; receives [SidePanelProps](SidePanelProps.md).

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:287](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L287)

Sort order within the side column. Defaults to 0.

***

### lazyMount?

```ts
optional lazyMount?: boolean;
```

Defined in: [packages/sdk/src/types.ts:293](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L293)

If true, defer mounting the component until the first time this panel
becomes active. Once mounted, stays mounted (panel can use `active`
to pause expensive work when hidden).

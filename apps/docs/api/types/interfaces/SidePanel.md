# Interface: SidePanel

Defined in: [packages/sdk/src/types.ts:276](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L276)

A panel mounted in the left or right side column (e.g. file explorer, git).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:278](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L278)

Unique id, conventionally namespaced.

***

### location

```ts
location: "left" | "right";
```

Defined in: [packages/sdk/src/types.ts:280](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L280)

Which side column to mount in.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:282](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L282)

Title shown in the column's panel switcher.

***

### component

```ts
component: ComponentType<SidePanelProps>;
```

Defined in: [packages/sdk/src/types.ts:284](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L284)

The React component; receives [SidePanelProps](SidePanelProps.md).

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:286](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L286)

Sort order within the side column. Defaults to 0.

***

### lazyMount?

```ts
optional lazyMount?: boolean;
```

Defined in: [packages/sdk/src/types.ts:292](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L292)

If true, defer mounting the component until the first time this panel
becomes active. Once mounted, stays mounted (panel can use `active`
to pause expensive work when hidden).

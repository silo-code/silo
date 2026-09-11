# Interface: SidePanel

Defined in: [packages/sdk/src/types.ts:564](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L564)

A panel mounted in the left or right side column (e.g. file explorer, git).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:566](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L566)

Unique id, conventionally namespaced.

***

### location

```ts
location: "left" | "right";
```

Defined in: [packages/sdk/src/types.ts:568](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L568)

Which side column to mount in.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:570](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L570)

Title shown in the column's panel switcher.

***

### component

```ts
component: ComponentType<SidePanelProps>;
```

Defined in: [packages/sdk/src/types.ts:572](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L572)

The React component; receives [SidePanelProps](SidePanelProps.md).

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:574](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L574)

Sort order within the side column. Defaults to 0.

***

### lazyMount?

```ts
optional lazyMount?: boolean;
```

Defined in: [packages/sdk/src/types.ts:580](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L580)

If true, defer mounting the component until the first time this panel
becomes active. Once mounted, stays mounted (panel can use `active`
to pause expensive work when hidden).

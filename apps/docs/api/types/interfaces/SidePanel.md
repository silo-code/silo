# Interface: SidePanel

Defined in: [packages/sdk/src/types.ts:616](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L616)

A panel mounted in the left or right side column (e.g. file explorer, git).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:618](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L618)

Unique id, conventionally namespaced.

***

### location

```ts
location: "left" | "right";
```

Defined in: [packages/sdk/src/types.ts:620](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L620)

Which side column to mount in.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:622](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L622)

Title shown in the column's panel switcher.

***

### component

```ts
component: ComponentType<SidePanelProps>;
```

Defined in: [packages/sdk/src/types.ts:624](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L624)

The React component; receives [SidePanelProps](SidePanelProps.md).

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:626](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L626)

Sort order within the side column. Defaults to 0.

***

### lazyMount?

```ts
optional lazyMount?: boolean;
```

Defined in: [packages/sdk/src/types.ts:632](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L632)

If true, defer mounting the component until the first time this panel
becomes active. Once mounted, stays mounted (panel can use `active`
to pause expensive work when hidden).

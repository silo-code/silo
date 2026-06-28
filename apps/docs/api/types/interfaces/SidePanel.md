# Interface: SidePanel

Defined in: [packages/sdk/src/types.ts:296](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L296)

A panel mounted in the left or right side column (e.g. file explorer, git).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:298](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L298)

Unique id, conventionally namespaced.

***

### location

```ts
location: "left" | "right";
```

Defined in: [packages/sdk/src/types.ts:300](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L300)

Which side column to mount in.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:302](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L302)

Title shown in the column's panel switcher.

***

### component

```ts
component: ComponentType<SidePanelProps>;
```

Defined in: [packages/sdk/src/types.ts:304](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L304)

The React component; receives [SidePanelProps](SidePanelProps.md).

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:306](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L306)

Sort order within the side column. Defaults to 0.

***

### lazyMount?

```ts
optional lazyMount?: boolean;
```

Defined in: [packages/sdk/src/types.ts:312](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L312)

If true, defer mounting the component until the first time this panel
becomes active. Once mounted, stays mounted (panel can use `active`
to pause expensive work when hidden).

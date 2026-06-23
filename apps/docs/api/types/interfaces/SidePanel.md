# Interface: SidePanel

Defined in: [packages/sdk/src/types.ts:290](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L290)

A panel mounted in the left or right side column (e.g. file explorer, git).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:292](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L292)

Unique id, conventionally namespaced.

***

### location

```ts
location: "left" | "right";
```

Defined in: [packages/sdk/src/types.ts:294](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L294)

Which side column to mount in.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:296](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L296)

Title shown in the column's panel switcher.

***

### component

```ts
component: ComponentType<SidePanelProps>;
```

Defined in: [packages/sdk/src/types.ts:298](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L298)

The React component; receives [SidePanelProps](SidePanelProps.md).

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:300](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L300)

Sort order within the side column. Defaults to 0.

***

### lazyMount?

```ts
optional lazyMount?: boolean;
```

Defined in: [packages/sdk/src/types.ts:306](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L306)

If true, defer mounting the component until the first time this panel
becomes active. Once mounted, stays mounted (panel can use `active`
to pause expensive work when hidden).

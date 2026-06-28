# Interface: SidePanel

Defined in: [packages/sdk/src/types.ts:291](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L291)

A panel mounted in the left or right side column (e.g. file explorer, git).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:293](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L293)

Unique id, conventionally namespaced.

***

### location

```ts
location: "left" | "right";
```

Defined in: [packages/sdk/src/types.ts:295](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L295)

Which side column to mount in.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:297](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L297)

Title shown in the column's panel switcher.

***

### component

```ts
component: ComponentType<SidePanelProps>;
```

Defined in: [packages/sdk/src/types.ts:299](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L299)

The React component; receives [SidePanelProps](SidePanelProps.md).

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:301](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L301)

Sort order within the side column. Defaults to 0.

***

### lazyMount?

```ts
optional lazyMount?: boolean;
```

Defined in: [packages/sdk/src/types.ts:307](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L307)

If true, defer mounting the component until the first time this panel
becomes active. Once mounted, stays mounted (panel can use `active`
to pause expensive work when hidden).

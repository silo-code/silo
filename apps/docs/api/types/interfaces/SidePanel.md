# Interface: SidePanel

Defined in: [packages/sdk/src/types.ts:300](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L300)

A panel mounted in the left or right side column (e.g. file explorer, git).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:302](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L302)

Unique id, conventionally namespaced.

***

### location

```ts
location: "left" | "right";
```

Defined in: [packages/sdk/src/types.ts:304](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L304)

Which side column to mount in.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:306](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L306)

Title shown in the column's panel switcher.

***

### component

```ts
component: ComponentType<SidePanelProps>;
```

Defined in: [packages/sdk/src/types.ts:308](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L308)

The React component; receives [SidePanelProps](SidePanelProps.md).

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:310](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L310)

Sort order within the side column. Defaults to 0.

***

### lazyMount?

```ts
optional lazyMount?: boolean;
```

Defined in: [packages/sdk/src/types.ts:316](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L316)

If true, defer mounting the component until the first time this panel
becomes active. Once mounted, stays mounted (panel can use `active`
to pause expensive work when hidden).

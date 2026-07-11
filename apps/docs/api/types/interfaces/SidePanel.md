# Interface: SidePanel

Defined in: [packages/sdk/src/types.ts:365](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L365)

A panel mounted in the left or right side column (e.g. file explorer, git).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:367](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L367)

Unique id, conventionally namespaced.

***

### location

```ts
location: "left" | "right";
```

Defined in: [packages/sdk/src/types.ts:369](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L369)

Which side column to mount in.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:371](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L371)

Title shown in the column's panel switcher.

***

### component

```ts
component: ComponentType<SidePanelProps>;
```

Defined in: [packages/sdk/src/types.ts:373](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L373)

The React component; receives [SidePanelProps](SidePanelProps.md).

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:375](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L375)

Sort order within the side column. Defaults to 0.

***

### lazyMount?

```ts
optional lazyMount?: boolean;
```

Defined in: [packages/sdk/src/types.ts:381](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L381)

If true, defer mounting the component until the first time this panel
becomes active. Once mounted, stays mounted (panel can use `active`
to pause expensive work when hidden).

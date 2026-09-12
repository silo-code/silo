# Interface: SidePanel

Defined in: [packages/sdk/src/types.ts:508](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L508)

A panel mounted in the left or right side column (e.g. file explorer, git).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:510](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L510)

Unique id, conventionally namespaced.

***

### location

```ts
location: "left" | "right";
```

Defined in: [packages/sdk/src/types.ts:512](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L512)

Which side column to mount in.

***

### title

```ts
title: string;
```

Defined in: [packages/sdk/src/types.ts:514](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L514)

Title shown in the column's panel switcher.

***

### component

```ts
component: ComponentType<SidePanelProps>;
```

Defined in: [packages/sdk/src/types.ts:516](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L516)

The React component; receives [SidePanelProps](SidePanelProps.md).

***

### order?

```ts
optional order?: number;
```

Defined in: [packages/sdk/src/types.ts:518](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L518)

Sort order within the side column. Defaults to 0.

***

### lazyMount?

```ts
optional lazyMount?: boolean;
```

Defined in: [packages/sdk/src/types.ts:524](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L524)

If true, defer mounting the component until the first time this panel
becomes active. Once mounted, stays mounted (panel can use `active`
to pause expensive work when hidden).

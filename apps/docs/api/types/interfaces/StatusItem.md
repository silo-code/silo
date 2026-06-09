# Interface: StatusItem

Defined in: [packages/sdk/src/types.ts:315](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L315)

A widget in the status bar (the strip along the bottom of the window).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:317](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L317)

Unique id for this status item.

***

### alignment

```ts
alignment: "left" | "right";
```

Defined in: [packages/sdk/src/types.ts:319](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L319)

Which end of the status bar this item sits at.

***

### priority?

```ts
optional priority?: number;
```

Defined in: [packages/sdk/src/types.ts:321](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L321)

Sort order within its alignment group. Lower sorts first. Defaults to 0.

***

### component

```ts
component: ComponentType;
```

Defined in: [packages/sdk/src/types.ts:323](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L323)

The React component (renders its own content; no props).

# Interface: StatusItem

Defined in: [packages/sdk/src/types.ts:316](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L316)

A widget in the status bar (the strip along the bottom of the window).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/types.ts:318](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L318)

Unique id for this status item.

***

### alignment

```ts
alignment: "left" | "right";
```

Defined in: [packages/sdk/src/types.ts:320](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L320)

Which end of the status bar this item sits at.

***

### priority?

```ts
optional priority?: number;
```

Defined in: [packages/sdk/src/types.ts:322](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L322)

Sort order within its alignment group. Lower sorts first. Defaults to 0.

***

### component

```ts
component: ComponentType;
```

Defined in: [packages/sdk/src/types.ts:324](https://github.com/silo-code/silo/blob/main/packages/sdk/src/types.ts#L324)

The React component (renders its own content; no props).

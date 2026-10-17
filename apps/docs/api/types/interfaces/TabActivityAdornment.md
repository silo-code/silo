# Interface: TabActivityAdornment

Defined in: [packages/sdk/src/tab-adornment.ts:99](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L99)

Host-owned [Activity](../type-aliases/Activity.md) on a CenterDock tab. Extensions pick the kind
(+ optional tooltip); never an icon or color (ADR 0030).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/tab-adornment.ts:101](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L101)

Extension-owned key; stacking + clear target.

***

### activity

```ts
activity: Activity;
```

Defined in: [packages/sdk/src/tab-adornment.ts:102](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L102)

***

### tooltip?

```ts
optional tooltip?: string;
```

Defined in: [packages/sdk/src/tab-adornment.ts:103](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L103)

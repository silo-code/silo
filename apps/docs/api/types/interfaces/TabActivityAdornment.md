# Interface: TabActivityAdornment

Defined in: [packages/sdk/src/tab-adornment.ts:94](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L94)

Host-owned [Activity](../type-aliases/Activity.md) on a CenterDock tab. Extensions pick the kind
(+ optional tooltip); never an icon or color (ADR 0030).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/tab-adornment.ts:96](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L96)

Extension-owned key; stacking + clear target.

***

### activity

```ts
activity: Activity;
```

Defined in: [packages/sdk/src/tab-adornment.ts:97](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L97)

***

### tooltip?

```ts
optional tooltip?: string;
```

Defined in: [packages/sdk/src/tab-adornment.ts:98](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L98)

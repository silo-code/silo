# Interface: TabActivityAdornment

Defined in: [packages/sdk/src/tab-adornment.ts:110](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L110)

Host-owned [Activity](../type-aliases/Activity.md) on a CenterDock tab. Extensions pick the kind
(+ optional tooltip); never an icon or color (ADR 0030).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/tab-adornment.ts:112](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L112)

Extension-owned key; stacking + clear target.

***

### activity

```ts
activity: Activity;
```

Defined in: [packages/sdk/src/tab-adornment.ts:113](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L113)

***

### tooltip?

```ts
optional tooltip?: string;
```

Defined in: [packages/sdk/src/tab-adornment.ts:114](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L114)

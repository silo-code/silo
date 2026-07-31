# Interface: TabActivityAdornment

Defined in: [packages/sdk/src/tab-adornment.ts:75](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L75)

Host-owned [Activity](../type-aliases/Activity.md) on a CenterDock tab. Extensions pick the kind
(+ optional tooltip); never an icon or color (ADR 0030).

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/tab-adornment.ts:77](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L77)

Extension-owned key; stacking + clear target.

***

### activity

```ts
activity: Activity;
```

Defined in: [packages/sdk/src/tab-adornment.ts:78](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L78)

***

### tooltip?

```ts
optional tooltip?: string;
```

Defined in: [packages/sdk/src/tab-adornment.ts:79](https://github.com/silo-code/silo/blob/main/packages/sdk/src/tab-adornment.ts#L79)

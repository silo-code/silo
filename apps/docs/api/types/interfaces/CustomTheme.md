# Interface: CustomTheme

Defined in: [packages/sdk/src/domain-types.ts:269](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L269)

A persisted custom theme.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/domain-types.ts:270](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L270)

***

### version

```ts
version: 2;
```

Defined in: [packages/sdk/src/domain-types.ts:275](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L275)

`2` since the `--silo-*` token rename (theming-contract.md › Migration).
v1 themes used the legacy bare names (`--bg`, `--text-hi`, …).

***

### name

```ts
name: string;
```

Defined in: [packages/sdk/src/domain-types.ts:276](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L276)

***

### base

```ts
base: ThemeBase;
```

Defined in: [packages/sdk/src/domain-types.ts:277](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L277)

***

### colorScheme

```ts
colorScheme: "dark" | "light";
```

Defined in: [packages/sdk/src/domain-types.ts:278](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L278)

***

### vars

```ts
vars: Partial<ThemeVars>;
```

Defined in: [packages/sdk/src/domain-types.ts:279](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L279)

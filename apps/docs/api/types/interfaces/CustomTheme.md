# Interface: CustomTheme

Defined in: [packages/sdk/src/domain-types.ts:232](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L232)

A persisted custom theme.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/domain-types.ts:233](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L233)

***

### version

```ts
version: 2;
```

Defined in: [packages/sdk/src/domain-types.ts:238](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L238)

`2` since the `--silo-*` token rename (theming-contract.md › Migration).
v1 themes used the legacy bare names (`--bg`, `--text-hi`, …).

***

### name

```ts
name: string;
```

Defined in: [packages/sdk/src/domain-types.ts:239](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L239)

***

### base

```ts
base: ThemeBase;
```

Defined in: [packages/sdk/src/domain-types.ts:240](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L240)

***

### colorScheme

```ts
colorScheme: "dark" | "light";
```

Defined in: [packages/sdk/src/domain-types.ts:241](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L241)

***

### vars

```ts
vars: Partial<ThemeVars>;
```

Defined in: [packages/sdk/src/domain-types.ts:242](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L242)

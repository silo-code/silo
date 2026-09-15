# Interface: CustomTheme

Defined in: [packages/sdk/src/domain-types.ts:359](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L359)

A persisted custom theme.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/domain-types.ts:360](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L360)

***

### version

```ts
version: 2;
```

Defined in: [packages/sdk/src/domain-types.ts:365](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L365)

`2` since the `--silo-*` token rename (theming-contract.md › Migration).
v1 themes used the legacy bare names (`--bg`, `--text-hi`, …).

***

### name

```ts
name: string;
```

Defined in: [packages/sdk/src/domain-types.ts:366](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L366)

***

### base

```ts
base: ThemeBase;
```

Defined in: [packages/sdk/src/domain-types.ts:367](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L367)

***

### colorScheme

```ts
colorScheme: "dark" | "light";
```

Defined in: [packages/sdk/src/domain-types.ts:368](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L368)

***

### vars

```ts
vars: Partial<ThemeVars>;
```

Defined in: [packages/sdk/src/domain-types.ts:369](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L369)

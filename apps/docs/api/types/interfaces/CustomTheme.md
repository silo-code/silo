# Interface: CustomTheme

Defined in: [packages/sdk/src/domain-types.ts:248](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L248)

A persisted custom theme.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/domain-types.ts:249](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L249)

***

### version

```ts
version: 2;
```

Defined in: [packages/sdk/src/domain-types.ts:254](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L254)

`2` since the `--silo-*` token rename (theming-contract.md › Migration).
v1 themes used the legacy bare names (`--bg`, `--text-hi`, …).

***

### name

```ts
name: string;
```

Defined in: [packages/sdk/src/domain-types.ts:255](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L255)

***

### base

```ts
base: ThemeBase;
```

Defined in: [packages/sdk/src/domain-types.ts:256](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L256)

***

### colorScheme

```ts
colorScheme: "dark" | "light";
```

Defined in: [packages/sdk/src/domain-types.ts:257](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L257)

***

### vars

```ts
vars: Partial<ThemeVars>;
```

Defined in: [packages/sdk/src/domain-types.ts:258](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L258)

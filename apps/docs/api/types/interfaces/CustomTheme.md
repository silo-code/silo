# Interface: CustomTheme

Defined in: [packages/sdk/src/domain-types.ts:227](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L227)

A persisted custom theme.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/domain-types.ts:228](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L228)

***

### version

```ts
version: 2;
```

Defined in: [packages/sdk/src/domain-types.ts:233](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L233)

`2` since the `--silo-*` token rename (theming-contract.md › Migration).
v1 themes used the legacy bare names (`--bg`, `--text-hi`, …).

***

### name

```ts
name: string;
```

Defined in: [packages/sdk/src/domain-types.ts:234](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L234)

***

### base

```ts
base: ThemeBase;
```

Defined in: [packages/sdk/src/domain-types.ts:235](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L235)

***

### colorScheme

```ts
colorScheme: "dark" | "light";
```

Defined in: [packages/sdk/src/domain-types.ts:236](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L236)

***

### vars

```ts
vars: Partial<ThemeVars>;
```

Defined in: [packages/sdk/src/domain-types.ts:237](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L237)

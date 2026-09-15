# Interface: CustomTheme

Defined in: [packages/sdk/src/domain-types.ts:377](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L377)

A persisted custom theme.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/domain-types.ts:378](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L378)

***

### version

```ts
version: 2;
```

Defined in: [packages/sdk/src/domain-types.ts:383](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L383)

`2` since the `--silo-*` token rename (theming-contract.md › Migration).
v1 themes used the legacy bare names (`--bg`, `--text-hi`, …).

***

### name

```ts
name: string;
```

Defined in: [packages/sdk/src/domain-types.ts:384](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L384)

***

### base

```ts
base: ThemeBase;
```

Defined in: [packages/sdk/src/domain-types.ts:385](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L385)

***

### colorScheme

```ts
colorScheme: "dark" | "light";
```

Defined in: [packages/sdk/src/domain-types.ts:386](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L386)

***

### vars

```ts
vars: Partial<ThemeVars>;
```

Defined in: [packages/sdk/src/domain-types.ts:387](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L387)

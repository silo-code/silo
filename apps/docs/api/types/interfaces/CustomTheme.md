# Interface: CustomTheme

Defined in: [packages/sdk/src/domain-types.ts:347](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L347)

A persisted custom theme.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/domain-types.ts:348](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L348)

***

### version

```ts
version: 2;
```

Defined in: [packages/sdk/src/domain-types.ts:353](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L353)

`2` since the `--silo-*` token rename (theming-contract.md › Migration).
v1 themes used the legacy bare names (`--bg`, `--text-hi`, …).

***

### name

```ts
name: string;
```

Defined in: [packages/sdk/src/domain-types.ts:354](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L354)

***

### base

```ts
base: ThemeBase;
```

Defined in: [packages/sdk/src/domain-types.ts:355](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L355)

***

### colorScheme

```ts
colorScheme: "dark" | "light";
```

Defined in: [packages/sdk/src/domain-types.ts:356](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L356)

***

### vars

```ts
vars: Partial<ThemeVars>;
```

Defined in: [packages/sdk/src/domain-types.ts:357](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L357)

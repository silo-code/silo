# Interface: CustomTheme

Defined in: [packages/sdk/src/domain-types.ts:230](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L230)

A persisted custom theme.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/domain-types.ts:231](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L231)

***

### version

```ts
version: 2;
```

Defined in: [packages/sdk/src/domain-types.ts:236](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L236)

`2` since the `--silo-*` token rename (theming-contract.md › Migration).
v1 themes used the legacy bare names (`--bg`, `--text-hi`, …).

***

### name

```ts
name: string;
```

Defined in: [packages/sdk/src/domain-types.ts:237](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L237)

***

### base

```ts
base: ThemeBase;
```

Defined in: [packages/sdk/src/domain-types.ts:238](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L238)

***

### colorScheme

```ts
colorScheme: "dark" | "light";
```

Defined in: [packages/sdk/src/domain-types.ts:239](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L239)

***

### vars

```ts
vars: Partial<ThemeVars>;
```

Defined in: [packages/sdk/src/domain-types.ts:240](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L240)

# Interface: CustomTheme

Defined in: [packages/sdk/src/domain-types.ts:236](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L236)

A persisted custom theme.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/domain-types.ts:237](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L237)

***

### version

```ts
version: 2;
```

Defined in: [packages/sdk/src/domain-types.ts:242](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L242)

`2` since the `--silo-*` token rename (theming-contract.md › Migration).
v1 themes used the legacy bare names (`--bg`, `--text-hi`, …).

***

### name

```ts
name: string;
```

Defined in: [packages/sdk/src/domain-types.ts:243](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L243)

***

### base

```ts
base: ThemeBase;
```

Defined in: [packages/sdk/src/domain-types.ts:244](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L244)

***

### colorScheme

```ts
colorScheme: "dark" | "light";
```

Defined in: [packages/sdk/src/domain-types.ts:245](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L245)

***

### vars

```ts
vars: Partial<ThemeVars>;
```

Defined in: [packages/sdk/src/domain-types.ts:246](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L246)

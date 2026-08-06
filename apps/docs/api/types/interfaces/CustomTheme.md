# Interface: CustomTheme

Defined in: [packages/sdk/src/domain-types.ts:234](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L234)

A persisted custom theme.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/domain-types.ts:235](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L235)

***

### version

```ts
version: 2;
```

Defined in: [packages/sdk/src/domain-types.ts:240](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L240)

`2` since the `--silo-*` token rename (theming-contract.md › Migration).
v1 themes used the legacy bare names (`--bg`, `--text-hi`, …).

***

### name

```ts
name: string;
```

Defined in: [packages/sdk/src/domain-types.ts:241](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L241)

***

### base

```ts
base: ThemeBase;
```

Defined in: [packages/sdk/src/domain-types.ts:242](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L242)

***

### colorScheme

```ts
colorScheme: "dark" | "light";
```

Defined in: [packages/sdk/src/domain-types.ts:243](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L243)

***

### vars

```ts
vars: Partial<ThemeVars>;
```

Defined in: [packages/sdk/src/domain-types.ts:244](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L244)

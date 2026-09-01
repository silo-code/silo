# Interface: CustomTheme

Defined in: [packages/sdk/src/domain-types.ts:294](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L294)

A persisted custom theme.

## Properties

### id

```ts
id: string;
```

Defined in: [packages/sdk/src/domain-types.ts:295](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L295)

***

### version

```ts
version: 2;
```

Defined in: [packages/sdk/src/domain-types.ts:300](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L300)

`2` since the `--silo-*` token rename (theming-contract.md › Migration).
v1 themes used the legacy bare names (`--bg`, `--text-hi`, …).

***

### name

```ts
name: string;
```

Defined in: [packages/sdk/src/domain-types.ts:301](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L301)

***

### base

```ts
base: ThemeBase;
```

Defined in: [packages/sdk/src/domain-types.ts:302](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L302)

***

### colorScheme

```ts
colorScheme: "dark" | "light";
```

Defined in: [packages/sdk/src/domain-types.ts:303](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L303)

***

### vars

```ts
vars: Partial<ThemeVars>;
```

Defined in: [packages/sdk/src/domain-types.ts:304](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L304)

# Interface: SearchFileResult

Defined in: [packages/sdk/src/search-service.ts:75](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L75)

All matches for a single file, returned in [SearchResponse.files](SearchResponse.md#files).

## Properties

### root?

```ts
optional root?: string;
```

Defined in: [packages/sdk/src/search-service.ts:81](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L81)

Absolute path of the search root this file lives under. Present when
searching multiple roots (via [SearchOptions.cwds](SearchOptions.md#cwds)); omitted for
single-root searches where the caller already knows the root.

***

### path

```ts
path: string;
```

Defined in: [packages/sdk/src/search-service.ts:83](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L83)

File path **relative to** `root` (or the search `cwd` for single-root searches).

***

### matches

```ts
matches: SearchMatch[];
```

Defined in: [packages/sdk/src/search-service.ts:85](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L85)

The matching lines within this file, in file order.

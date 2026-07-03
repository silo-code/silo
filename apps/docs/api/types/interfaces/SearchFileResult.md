# Interface: SearchFileResult

Defined in: [packages/sdk/src/search-service.ts:86](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L86)

All matches for a single file, returned in [SearchResponse.files](SearchResponse.md#files).

## Properties

### root?

```ts
optional root?: string;
```

Defined in: [packages/sdk/src/search-service.ts:92](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L92)

Absolute path of the search root this file lives under. Present when
searching multiple roots (via [SearchOptions.cwds](SearchOptions.md#cwds)); omitted for
single-root searches where the caller already knows the root.

***

### path

```ts
path: string;
```

Defined in: [packages/sdk/src/search-service.ts:94](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L94)

File path **relative to** `root` (or the search `cwd` for single-root searches).

***

### matches

```ts
matches: SearchMatch[];
```

Defined in: [packages/sdk/src/search-service.ts:96](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L96)

The matching lines within this file, in file order.

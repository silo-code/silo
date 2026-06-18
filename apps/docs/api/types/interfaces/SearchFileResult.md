# Interface: SearchFileResult

Defined in: [packages/sdk/src/search-service.ts:68](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L68)

All matches for a single file, returned in [SearchResponse.files](SearchResponse.md#files).

## Properties

### path

```ts
path: string;
```

Defined in: [packages/sdk/src/search-service.ts:70](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L70)

File path **relative to** the search `cwd` (the workspace folder by default).

***

### matches

```ts
matches: SearchMatch[];
```

Defined in: [packages/sdk/src/search-service.ts:72](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L72)

The matching lines within this file, in file order.

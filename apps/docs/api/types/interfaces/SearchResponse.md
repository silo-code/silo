# Interface: SearchResponse

Defined in: [packages/sdk/src/search-service.ts:106](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L106)

The result of a [SearchService.search](SearchService.md#search) call — matches grouped by file
plus totals for the summary line ("N results in M files").

## Properties

### files

```ts
files: SearchFileResult[];
```

Defined in: [packages/sdk/src/search-service.ts:108](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L108)

Files that contained at least one match, in traversal order.

***

### totalMatches

```ts
totalMatches: number;
```

Defined in: [packages/sdk/src/search-service.ts:110](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L110)

Total number of matches across every file.

***

### truncated

```ts
truncated: boolean;
```

Defined in: [packages/sdk/src/search-service.ts:115](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L115)

True when the search stopped early at [SearchOptions.maxResults](SearchOptions.md#maxresults) — the
results are a prefix, not the complete set.

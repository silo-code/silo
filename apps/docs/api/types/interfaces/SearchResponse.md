# Interface: SearchResponse

Defined in: [packages/sdk/src/search-service.ts:82](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L82)

The result of a [SearchService.search](SearchService.md#search) call — matches grouped by file
plus totals for the summary line ("N results in M files").

## Properties

### files

```ts
files: SearchFileResult[];
```

Defined in: [packages/sdk/src/search-service.ts:84](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L84)

Files that contained at least one match, in traversal order.

***

### totalMatches

```ts
totalMatches: number;
```

Defined in: [packages/sdk/src/search-service.ts:86](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L86)

Total number of matches across every file.

***

### truncated

```ts
truncated: boolean;
```

Defined in: [packages/sdk/src/search-service.ts:91](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L91)

True when the search stopped early at [SearchOptions.maxResults](SearchOptions.md#maxresults) — the
results are a prefix, not the complete set.

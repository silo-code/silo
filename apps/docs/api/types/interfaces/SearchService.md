# Interface: SearchService

Defined in: [packages/sdk/src/search-service.ts:120](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L120)

Cross-file content search, exposed as [ExtensionContext.search](ExtensionContext.md#search). Runs a
native search engine in the host (off the UI thread) over the workspace,
honoring `.gitignore`, and resolves with matches grouped by file.

The contract is intentionally extensible: a future replace capability can be
added as an additional method without breaking this one, and
[SearchMatch.ranges](SearchMatch.md#ranges) + [SearchFileResult.path](SearchFileResult.md#path) already carry the
precise locations such a replace would target.

## Methods

### search()

```ts
search(query, options?): Promise<SearchResponse>;
```

Defined in: [packages/sdk/src/search-service.ts:137](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L137)

Search file contents under [SearchOptions.cwd](SearchOptions.md#cwd) (the active workspace
folder by default). Resolves with an empty [SearchResponse](SearchResponse.md) for an
empty `query`. Rejects only if the search could not be started (e.g. the cwd
is denied); a search that simply finds nothing resolves with no files.

#### Parameters

##### query

`string`

The text or regex (see [SearchOptions.regex](SearchOptions.md#regex)) to find.

##### options?

[`SearchOptions`](SearchOptions.md)

Optional [SearchOptions](SearchOptions.md).

#### Returns

`Promise`\<[`SearchResponse`](SearchResponse.md)\>

#### Example

```ts
const { files, totalMatches } = await ctx.search.search("tokyo", {
  caseSensitive: false,
  excludeGlobs: ["**/dist/**"],
});
```

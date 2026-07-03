# Interface: SearchOptions

Defined in: [packages/sdk/src/search-service.ts:14](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L14)

Options for [SearchService.search](SearchService.md#search). All flags default to off / empty;
an omitted `options` runs a plain, case-insensitive substring search over the
active workspace, respecting `.gitignore`.

## Properties

### cwd?

```ts
optional cwd?: string;
```

Defined in: [packages/sdk/src/search-service.ts:21](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L21)

Search root. Defaults to the open **workspace folder** when omitted. A `cwd`
outside the workspace throws [PathDeniedError](../classes/PathDeniedError.md) unless the extension
declared the `process` [Permission](../type-aliases/Permission.md); first-party extensions are unscoped.
Ignored when [SearchOptions.cwds](#cwds) is non-empty.

***

### cwds?

```ts
optional cwds?: string[];
```

Defined in: [packages/sdk/src/search-service.ts:27](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L27)

Multiple search roots. When provided, all listed folders are searched and
results are merged. Each root is subject to the same scope guard as `cwd`.
Takes precedence over `cwd` when non-empty.

***

### regex?

```ts
optional regex?: boolean;
```

Defined in: [packages/sdk/src/search-service.ts:29](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L29)

Treat `query` as a regular expression instead of a literal string.

***

### caseSensitive?

```ts
optional caseSensitive?: boolean;
```

Defined in: [packages/sdk/src/search-service.ts:31](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L31)

Match case exactly. When false (default), the search is case-insensitive.

***

### wholeWord?

```ts
optional wholeWord?: boolean;
```

Defined in: [packages/sdk/src/search-service.ts:33](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L33)

Match whole words only (word boundaries around the query).

***

### includeGlobs?

```ts
optional includeGlobs?: string[];
```

Defined in: [packages/sdk/src/search-service.ts:38](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L38)

Glob patterns of files to include (e.g. `["*.ts", "src/**"]`). When empty,
all files are eligible (still subject to `.gitignore` and `excludeGlobs`).

***

### excludeGlobs?

```ts
optional excludeGlobs?: string[];
```

Defined in: [packages/sdk/src/search-service.ts:40](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L40)

Glob patterns of files to exclude (e.g. `["**/dist/**"]`), on top of `.gitignore`.

***

### maxResults?

```ts
optional maxResults?: number;
```

Defined in: [packages/sdk/src/search-service.ts:45](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L45)

Cap on the total number of matches collected across all files. When the cap
is hit, the search stops early and [SearchResponse.truncated](SearchResponse.md#truncated) is true.

***

### signal?

```ts
optional signal?: AbortSignal;
```

Defined in: [packages/sdk/src/search-service.ts:56](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L56)

Cancel the search. When the signal aborts, the promise returned by
[SearchService.search](SearchService.md#search) rejects with an `Error` whose `name` is
`"AbortError"` (the `fetch` convention — branch on `err.name`).

Cancellation is observable immediately, but the native search may still run
to completion in the background — its result is simply discarded. Use this
to abandon a stale query (e.g. superseded by the next keystroke) rather than
to reclaim native CPU the instant you abort.

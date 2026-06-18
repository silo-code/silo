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

Defined in: [packages/sdk/src/search-service.ts:20](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L20)

Search root. Defaults to the open **workspace folder** when omitted. A `cwd`
outside the workspace throws [PathDeniedError](../classes/PathDeniedError.md) unless the extension
declared the `process` [Permission](../type-aliases/Permission.md); first-party extensions are unscoped.

***

### regex?

```ts
optional regex?: boolean;
```

Defined in: [packages/sdk/src/search-service.ts:22](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L22)

Treat `query` as a regular expression instead of a literal string.

***

### caseSensitive?

```ts
optional caseSensitive?: boolean;
```

Defined in: [packages/sdk/src/search-service.ts:24](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L24)

Match case exactly. When false (default), the search is case-insensitive.

***

### wholeWord?

```ts
optional wholeWord?: boolean;
```

Defined in: [packages/sdk/src/search-service.ts:26](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L26)

Match whole words only (word boundaries around the query).

***

### includeGlobs?

```ts
optional includeGlobs?: string[];
```

Defined in: [packages/sdk/src/search-service.ts:31](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L31)

Glob patterns of files to include (e.g. `["*.ts", "src/**"]`). When empty,
all files are eligible (still subject to `.gitignore` and `excludeGlobs`).

***

### excludeGlobs?

```ts
optional excludeGlobs?: string[];
```

Defined in: [packages/sdk/src/search-service.ts:33](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L33)

Glob patterns of files to exclude (e.g. `["**/dist/**"]`), on top of `.gitignore`.

***

### maxResults?

```ts
optional maxResults?: number;
```

Defined in: [packages/sdk/src/search-service.ts:38](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L38)

Cap on the total number of matches collected across all files. When the cap
is hit, the search stops early and [SearchResponse.truncated](SearchResponse.md#truncated) is true.

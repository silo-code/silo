# ctx.search <Badge type="tip" text="stable" />

Cross-file **content search** over the workspace — the core primitive under the
Search panel (and future quick-open / find-references). Runs a native search
engine in the host (off the UI thread), honoring `.gitignore`, and resolves with
matches grouped by file.

```ts
ctx.search: SearchService
```

## Example

```ts
const { files, totalMatches, truncated } = await ctx.search.search("tokyo", {
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  includeGlobs: ["*.ts", "*.tsx"],
  excludeGlobs: ["**/dist/**"],
});

for (const file of files) {
  console.log(file.path, file.matches.length);
  for (const m of file.matches) {
    // m.line is 1-indexed; m.ranges are [start, end) offsets into m.preview
    console.log(m.line, m.preview);
  }
}
```

A clicked result opens at its match by pairing search with
[`ctx.editors.open`](/api/editors/)'s `selection`:

```ts
const range = match.ranges[0];
ctx.editors.open(`${workspaceFolder}/${file.path}`, {
  preview: true,
  selection: {
    line: match.line,
    column: range ? range[0] + 1 : 1, // ranges are 0-indexed; columns are 1-indexed
    endLine: match.line,
    endColumn: range ? range[1] + 1 : undefined,
  },
});
```

## Behavior

- An **empty query resolves to an empty result** (no files, `totalMatches: 0`).
- The search **respects `.gitignore`** (and `.ignore`/global git excludes), like
  ripgrep — `node_modules`, `dist`, etc. are skipped unless you un-ignore them.
- `includeGlobs` whitelists; `excludeGlobs` blacklists on top of `.gitignore`.
- It stops at `maxResults` and sets [`truncated`](/api/types/interfaces/SearchResponse#truncated)
  when the cap is hit — the results are then a prefix, not the full set.
- The promise **rejects only if the search can't be started** (e.g. a denied
  `cwd`); a search that simply finds nothing resolves with no files.

## Methods

**`SearchService`** (`ctx.search`):

| Method                                                                  | What it does                                                                                                                        |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [`search(query, options?)`](/api/types/interfaces/SearchService#search) | Search file contents under `cwd`; resolves to a [`SearchResponse`](/api/types/interfaces/SearchResponse) (matches grouped by file). |

## Types

[`SearchService`](/api/types/interfaces/SearchService) ·
[`SearchOptions`](/api/types/interfaces/SearchOptions) ·
[`SearchResponse`](/api/types/interfaces/SearchResponse) ·
[`SearchFileResult`](/api/types/interfaces/SearchFileResult) ·
[`SearchMatch`](/api/types/interfaces/SearchMatch).

## Workspace scoping {#workspace-scoping}

Like [`ctx.process`](/api/process/#workspace-scoping), a third-party extension's
search is **scoped to the open workspace**: `cwd` defaults to the workspace
folder, and a `cwd` outside it throws
[`PathDeniedError`](/api/types/classes/PathDeniedError) unless the extension
declared the `process` [`Permission`](/api/types/type-aliases/Permission).
(First-party bundled extensions are unscoped.)

## Replace

Search-replace is [planned](/roadmap): it will be added to `SearchService` as an
additional method without breaking `search`. The result shape already carries
what a replace needs — [`SearchMatch.ranges`](/api/types/interfaces/SearchMatch#ranges)
plus [`SearchFileResult.path`](/api/types/interfaces/SearchFileResult#path) — so a
future replace can target precise ranges without re-searching.

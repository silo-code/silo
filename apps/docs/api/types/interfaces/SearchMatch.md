# Interface: SearchMatch

Defined in: [packages/sdk/src/search-service.ts:47](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L47)

One matching line within a file, returned in [SearchFileResult.matches](SearchFileResult.md#matches).

## Properties

### line

```ts
line: number;
```

Defined in: [packages/sdk/src/search-service.ts:49](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L49)

1-indexed line number of the match within the file.

***

### preview

```ts
preview: string;
```

Defined in: [packages/sdk/src/search-service.ts:54](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L54)

The matched line's text, suitable for a preview. Very long lines are
truncated by the host; `ranges` are adjusted to stay valid against this string.

***

### ranges

```ts
ranges: [number, number][];
```

Defined in: [packages/sdk/src/search-service.ts:59](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L59)

Character ranges of the matches within [SearchMatch.preview](#preview), each
`[start, end)` (0-indexed, end-exclusive). A line can contain several matches.

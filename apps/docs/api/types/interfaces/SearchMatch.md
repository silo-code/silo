# Interface: SearchMatch

Defined in: [packages/sdk/src/search-service.ts:65](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L65)

One matching line within a file, returned in [SearchFileResult.matches](SearchFileResult.md#matches).

## Properties

### line

```ts
line: number;
```

Defined in: [packages/sdk/src/search-service.ts:67](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L67)

1-indexed line number of the match within the file.

***

### preview

```ts
preview: string;
```

Defined in: [packages/sdk/src/search-service.ts:72](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L72)

The matched line's text, suitable for a preview. Very long lines are
truncated by the host; `ranges` are adjusted to stay valid against this string.

***

### ranges

```ts
ranges: [number, number][];
```

Defined in: [packages/sdk/src/search-service.ts:77](https://github.com/silo-code/silo/blob/main/packages/sdk/src/search-service.ts#L77)

Character ranges of the matches within [SearchMatch.preview](#preview), each
`[start, end)` (0-indexed, end-exclusive). A line can contain several matches.

# Type Alias: EditorMode

```ts
type EditorMode = "text" | "diff";
```

Defined in: [packages/sdk/src/domain-types.ts:62](https://github.com/silo-code/silo/blob/main/packages/sdk/src/domain-types.ts#L62)

The two modes of the one editor surface: a read-write text editor, or a
read-only two-model diff. Absent on a record means `"text"`.

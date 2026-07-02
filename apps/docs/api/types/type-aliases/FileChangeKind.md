# Type Alias: FileChangeKind

```ts
type FileChangeKind = "create" | "modify" | "remove" | "other";
```

Defined in: [packages/sdk/src/file-service.ts:35](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L35)

The normalized kind of a filesystem change, as delivered in
[FileChangeEvent.kind](../interfaces/FileChangeEvent.md#kind). Backend-specific event kinds that don't map to
one of the three meaningful values are surfaced as `"other"`.

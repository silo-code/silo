# Variable: DND\_MIME

```ts
const DND_MIME: object;
```

Defined in: [packages/sdk/src/dnd-service.ts:15](https://github.com/silo-code/silo/blob/main/packages/sdk/src/dnd-service.ts#L15)

Well-known MIME types for Silo drag payloads. Use these constants (rather than
raw strings) so drags interoperate across extensions and built-ins.

## Type Declaration

### filePath

```ts
readonly filePath: "application/x-silo-file-path" = "application/x-silo-file-path";
```

Absolute filesystem path of a file or directory being dragged.

### text

```ts
readonly text: "text/plain" = "text/plain";
```

Plain-text payload (mirrors the path today).

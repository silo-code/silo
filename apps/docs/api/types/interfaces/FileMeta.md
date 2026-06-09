# Interface: FileMeta

Defined in: [packages/sdk/src/file-service.ts:14](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L14)

Metadata for a single directory entry, as returned by
[FileService.readDir](FileService.md#readdir).

## Properties

### name

```ts
name: string;
```

Defined in: [packages/sdk/src/file-service.ts:16](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L16)

The entry's base name (no path).

***

### path

```ts
path: string;
```

Defined in: [packages/sdk/src/file-service.ts:18](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L18)

Absolute path to the entry.

***

### isDir

```ts
isDir: boolean;
```

Defined in: [packages/sdk/src/file-service.ts:20](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L20)

True if the entry is a directory.

***

### size

```ts
size: number;
```

Defined in: [packages/sdk/src/file-service.ts:22](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L22)

Size in bytes (0 for directories).

***

### modifiedMs

```ts
modifiedMs: number;
```

Defined in: [packages/sdk/src/file-service.ts:24](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L24)

Last-modified time, milliseconds since the Unix epoch.

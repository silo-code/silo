# Interface: FileService

Defined in: [packages/sdk/src/file-service.ts:78](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L78)

The filesystem domain, exposed as [ExtensionContext.files](ExtensionContext.md#files). All access
is host-mediated: extensions read, write, and watch the filesystem through
here rather than calling Tauri directly.

**Paths are workspace-scoped.** A relative path resolves against the open
workspace folder (`"src/index.ts"` → `<workspace>/src/index.ts`); an absolute
path is allowed only if it falls inside a workspace folder. A path outside the
workspace throws [PathDeniedError](../classes/PathDeniedError.md) unless the extension declared the
matching [Permission](../type-aliases/Permission.md) (`fs:read` for reads, `fs:write` for writes).
First-party (bundled) extensions are unscoped. Prefer relative paths — they're
portable across machines.

Watching is host-owned: [FileService.watch](#watch) expresses intent — "tell me
about changes under this path" — and the host owns the underlying OS
watcher(s). Many in-workspace subscriptions are served from a single,
ref-counted workspace watcher the host manages; extensions never start or
stop watchers themselves, and each listener receives only events scoped to
its path.

## Methods

### readText()

```ts
readText(path): Promise<string>;
```

Defined in: [packages/sdk/src/file-service.ts:80](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L80)

Read a file's contents as UTF-8 text.

#### Parameters

##### path

`string`

#### Returns

`Promise`\<`string`\>

***

### readBytes()

```ts
readBytes(path): Promise<ArrayBuffer>;
```

Defined in: [packages/sdk/src/file-service.ts:82](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L82)

Read a file's raw bytes.

#### Parameters

##### path

`string`

#### Returns

`Promise`\<`ArrayBuffer`\>

***

### readDir()

```ts
readDir(path): Promise<FileMeta[]>;
```

Defined in: [packages/sdk/src/file-service.ts:84](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L84)

List a directory's immediate entries.

#### Parameters

##### path

`string`

#### Returns

`Promise`\<[`FileMeta`](FileMeta.md)[]\>

***

### pathExists()

```ts
pathExists(path): Promise<boolean>;
```

Defined in: [packages/sdk/src/file-service.ts:90](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L90)

Resolve true if a file or directory exists at `path`. Prefer
[FileService.stat](#stat) when you also need the entry's metadata — `stat`
returning non-`null` subsumes this check in one call.

#### Parameters

##### path

`string`

#### Returns

`Promise`\<`boolean`\>

***

### stat()

```ts
stat(path): Promise<FileMeta | null>;
```

Defined in: [packages/sdk/src/file-service.ts:98](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L98)

Metadata for a single path, following symlinks, or `null` if nothing
exists there. Resolving `null` (rather than rejecting) for an absent path
is deliberate — it makes `stat` a one-call replacement for
[FileService.pathExists](#pathexists) that also returns size / mtime / type.
Rejects only on a real I/O error (e.g. a permission failure).

#### Parameters

##### path

`string`

#### Returns

`Promise`\<[`FileMeta`](FileMeta.md) \| `null`\>

***

### writeText()

```ts
writeText(path, content): Promise<void>;
```

Defined in: [packages/sdk/src/file-service.ts:100](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L100)

Write UTF-8 text to a file, creating or overwriting it.

#### Parameters

##### path

`string`

##### content

`string`

#### Returns

`Promise`\<`void`\>

***

### writeBytes()

```ts
writeBytes(path, data): Promise<void>;
```

Defined in: [packages/sdk/src/file-service.ts:107](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L107)

Write raw bytes to a file, creating or overwriting it (and creating any
missing parent directories). The byte-oriented counterpart to
[FileService.writeText](#writetext) / [FileService.readBytes](#readbytes) — use it for
binary assets (images, archives) where `writeText` would corrupt the data.

#### Parameters

##### path

`string`

##### data

`ArrayBuffer` \| `Uint8Array`\<`ArrayBufferLike`\>

#### Returns

`Promise`\<`void`\>

***

### createDir()

```ts
createDir(path): Promise<void>;
```

Defined in: [packages/sdk/src/file-service.ts:109](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L109)

Create a directory (and any missing parents).

#### Parameters

##### path

`string`

#### Returns

`Promise`\<`void`\>

***

### copy()

```ts
copy(src, dest): Promise<void>;
```

Defined in: [packages/sdk/src/file-service.ts:116](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L116)

Copy a file or directory from `src` to `dest`, recursively for
directories, creating any missing parent directories. Requires read access
to `src` and write access to `dest` (both are workspace-scoped). Overwrites
existing files at the destination.

#### Parameters

##### src

`string`

##### dest

`string`

#### Returns

`Promise`\<`void`\>

***

### rename()

```ts
rename(oldPath, newPath): Promise<void>;
```

Defined in: [packages/sdk/src/file-service.ts:118](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L118)

Rename / move a file or directory.

#### Parameters

##### oldPath

`string`

##### newPath

`string`

#### Returns

`Promise`\<`void`\>

***

### delete()

```ts
delete(path): Promise<void>;
```

Defined in: [packages/sdk/src/file-service.ts:125](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L125)

**Permanently** delete a file or directory (directories are removed
recursively). This does **not** move the entry to the OS trash/recycle
bin — the delete is irreversible, so confirm destructive removals with the
user first. Rejects if the path does not exist.

#### Parameters

##### path

`string`

#### Returns

`Promise`\<`void`\>

***

### reveal()

```ts
reveal(path): Promise<void>;
```

Defined in: [packages/sdk/src/file-service.ts:127](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L127)

Reveal a path in the OS file manager (Finder / Explorer).

#### Parameters

##### path

`string`

#### Returns

`Promise`\<`void`\>

***

### watch()

```ts
watch(path, listener): Disposable;
```

Defined in: [packages/sdk/src/file-service.ts:134](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L134)

Watch `path` recursively, invoking `listener` for each change under it.
Returns a [Disposable](Disposable.md) that stops listening when disposed. Watcher
lifecycle is the host's concern — in-workspace paths ride the host's
ref-counted workspace watcher rather than each spinning up its own.

#### Parameters

##### path

`string`

##### listener

(`event`) => `void`

#### Returns

[`Disposable`](Disposable.md)

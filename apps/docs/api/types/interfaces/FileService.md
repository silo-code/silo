# Interface: FileService

Defined in: [packages/sdk/src/file-service.ts:64](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L64)

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

Defined in: [packages/sdk/src/file-service.ts:66](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L66)

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

Defined in: [packages/sdk/src/file-service.ts:68](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L68)

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

Defined in: [packages/sdk/src/file-service.ts:70](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L70)

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

Defined in: [packages/sdk/src/file-service.ts:72](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L72)

Resolve true if a file or directory exists at `path`.

#### Parameters

##### path

`string`

#### Returns

`Promise`\<`boolean`\>

***

### writeText()

```ts
writeText(path, content): Promise<void>;
```

Defined in: [packages/sdk/src/file-service.ts:74](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L74)

Write UTF-8 text to a file, creating or overwriting it.

#### Parameters

##### path

`string`

##### content

`string`

#### Returns

`Promise`\<`void`\>

***

### createDir()

```ts
createDir(path): Promise<void>;
```

Defined in: [packages/sdk/src/file-service.ts:76](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L76)

Create a directory (and any missing parents).

#### Parameters

##### path

`string`

#### Returns

`Promise`\<`void`\>

***

### rename()

```ts
rename(oldPath, newPath): Promise<void>;
```

Defined in: [packages/sdk/src/file-service.ts:78](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L78)

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

Defined in: [packages/sdk/src/file-service.ts:80](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L80)

Delete a file or directory.

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

Defined in: [packages/sdk/src/file-service.ts:82](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L82)

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

Defined in: [packages/sdk/src/file-service.ts:89](https://github.com/silo-code/silo/blob/main/packages/sdk/src/file-service.ts#L89)

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

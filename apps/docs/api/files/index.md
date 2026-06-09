# ctx.files <Badge type="tip" text="stable" />

Host-mediated filesystem access — read, write, list, and watch files through the
host rather than calling the platform directly. This is the single **privileged
chokepoint** for the filesystem, which is why it's a core primitive — and where
[workspace scoping](#workspace-scoping) is enforced.

```ts
ctx.files: FileService
```

## Example

```tsx
// read a file into your viewer
const text = await ctx.files.readText(path);

// write it back
await ctx.files.writeText(path, next);

// react to external changes (e.g. another tool rewrote the file)
const sub = ctx.files.watch(path, (evt) => {
  if (evt.kind === "modify") reload();
});
// ...later
sub.dispose(); // stop watching
```

## Methods

**`FileService`** (`ctx.files`):

| Method                                                                    | What it does                                                                                                                                                                             |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`readText(path)`](/api/types/interfaces/FileService#readtext)            | Read a file as UTF-8 text.                                                                                                                                                               |
| [`readBytes(path)`](/api/types/interfaces/FileService#readbytes)          | Read a file's raw bytes (`ArrayBuffer`).                                                                                                                                                 |
| [`readDir(path)`](/api/types/interfaces/FileService#readdir)              | List a directory's entries as [`FileMeta`](/api/types/interfaces/FileMeta)[].                                                                                                            |
| [`pathExists(path)`](/api/types/interfaces/FileService#pathexists)        | Resolve true if something exists at `path`.                                                                                                                                              |
| [`writeText(path, content)`](/api/types/interfaces/FileService#writetext) | Write UTF-8 text, creating or overwriting.                                                                                                                                               |
| [`createDir(path)`](/api/types/interfaces/FileService#createdir)          | Create a directory (and missing parents).                                                                                                                                                |
| [`rename(oldPath, newPath)`](/api/types/interfaces/FileService#rename)    | Rename / move a file or directory.                                                                                                                                                       |
| [`delete(path)`](/api/types/interfaces/FileService#delete)                | Delete a file or directory.                                                                                                                                                              |
| [`reveal(path)`](/api/types/interfaces/FileService#reveal)                | Reveal a path in the OS file manager.                                                                                                                                                    |
| [`watch(path, listener)`](/api/types/interfaces/FileService#watch)        | Watch `path` recursively; `listener` gets a [`FileChangeEvent`](/api/types/interfaces/FileChangeEvent) for changes under it. Returns a [`Disposable`](/api/types/interfaces/Disposable). |

## Types

[`FileService`](/api/types/interfaces/FileService) ·
[`FileMeta`](/api/types/interfaces/FileMeta) ·
[`FileChangeEvent`](/api/types/interfaces/FileChangeEvent) ·
[`Permission`](/api/types/type-aliases/Permission) ·
[`PathDeniedError`](/api/types/classes/PathDeniedError).

## Workspace scoping {#workspace-scoping}

A third-party extension's file access is **confined to the open workspace**. A
relative path resolves against the workspace folder (`"src/index.ts"` →
`<workspace>/src/index.ts`); an absolute path is allowed only if it falls inside
a workspace folder. A path outside throws
[`PathDeniedError`](/api/types/classes/PathDeniedError) unless the extension
declared the matching [`Permission`](/api/types/type-aliases/Permission) — `fs:read` for
reads, `fs:write` for writes — which the user consents to at install. Prefer
relative paths; they're portable across machines. See the
[Permissions & access](/guide/permissions) guide. (First-party bundled
extensions are unscoped.)

## Notes

Watching is **host-owned**: `watch(path, listener)` expresses intent ("tell me
about changes under this path") and the host owns the underlying OS watcher(s).
Each listener receives only events scoped to its path — an extension never
starts or stops watchers, and never depends on another extension owning the
watch.

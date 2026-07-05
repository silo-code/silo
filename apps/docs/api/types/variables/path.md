# Variable: path

```ts
const path: object;
```

Defined in: [packages/sdk/src/path.ts:69](https://github.com/silo-code/silo/blob/main/packages/sdk/src/path.ts#L69)

Path utilities for extensions — a cross-platform replacement for
`node:path`, which extensions are banned from importing. All output paths
use forward-slash separators (the form [FileService](../interfaces/FileService.md) accepts on every
platform). Both `/` and `` are accepted as input separators.

## Type Declaration

### join()

```ts
join(...parts): string;
```

Join path segments and normalize the result. Empty segments are ignored;
`\` separators in any segment are treated as `/`.

#### Parameters

##### parts

...`string`[]

#### Returns

`string`

### dirname()

```ts
dirname(p): string;
```

Return the directory portion of a path — everything up to (not including)
the last `/`. Returns `"."` for a bare filename with no directory component.

#### Parameters

##### p

`string`

#### Returns

`string`

### basename()

```ts
basename(p, ext?): string;
```

Return the final component of a path. If `ext` is supplied and the
basename ends with that string, it is stripped from the result.

#### Parameters

##### p

`string`

##### ext?

`string`

#### Returns

`string`

### extname()

```ts
extname(p): string;
```

Return the extension of a path — the portion from the last `.` of the
basename, including the dot. Returns `""` for paths with no extension and
for dotfiles with no secondary extension (e.g. `".gitignore"` → `""`).

#### Parameters

##### p

`string`

#### Returns

`string`

### relative()

```ts
relative(from, to): string;
```

Compute the relative path from `from` to `to`. Both should be absolute
paths on the same drive. When they are on different Windows drive letters,
`to` (normalized) is returned unchanged — no relative path exists between
drives.

#### Parameters

##### from

`string`

##### to

`string`

#### Returns

`string`

### isAbsolute()

```ts
isAbsolute(p): boolean;
```

Return `true` if `p` is an absolute path: starts with `/` (POSIX), has a
drive letter followed by a slash (`C:/`, `C:\`), or is a UNC path
(`\\server\share` / `//server/share`). Note: `C:foo` (drive-relative,
no slash) is NOT absolute.

#### Parameters

##### p

`string`

#### Returns

`boolean`

### normalize()

```ts
normalize(p): string;
```

Normalize a path: convert `\` to `/`, collapse duplicate slashes, and
resolve `.` and `..` segments.

#### Parameters

##### p

`string`

#### Returns

`string`

## Example

```ts
import { path } from "@silo-code/sdk";

const dir  = path.dirname(filePath);            // "/home/user/docs"
const full = path.join(dir, "images/fig.png");  // "/home/user/docs/images/fig.png"
const rel  = path.relative(dir, full);           // "images/fig.png"
const ext  = path.extname(full);                 // ".png"
```

# path

Pure path utilities for extensions — a cross-platform replacement for
`node:path`, which extensions are banned from importing (platform ban). All
output paths use forward-slash separators, the form
[`FileService`](/api/files/) accepts on every platform. Both `/` and `\` are
accepted as input separators.

```ts
import { path } from "@silo-code/sdk";
```

## Members

| Method                    | Description                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| `path.join(...parts)`     | Join segments and normalize. Empty parts are ignored.                                                     |
| `path.dirname(p)`         | Directory portion up to (not including) the last `/`.                                                     |
| `path.basename(p, ext?)`  | Final component of `p`. Strips `ext` if supplied and matching.                                            |
| `path.extname(p)`         | Extension from the last `.` of the basename, including the dot. `""` for no extension and dotfiles.       |
| `path.relative(from, to)` | Relative path from `from` to `to`. Returns `to` unchanged when the paths are on different Windows drives. |
| `path.isAbsolute(p)`      | `true` for POSIX `/`, Windows `C:\`/`C:/`, or UNC `\\server\share`.                                       |
| `path.normalize(p)`       | Collapse `.` and `..` segments; convert `\` to `/`.                                                       |

## Example

```ts
import { path } from "@silo-code/sdk";

// Resolve a link relative to the open file:
const dir = path.dirname(filePath); // "/home/user/docs"
const full = path.join(dir, "images/fig.png"); // "/home/user/docs/images/fig.png"
const rel = path.relative(dir, full); // "images/fig.png"
const ext = path.extname(full); // ".png"
const name = path.basename(full, ext); // "fig"

// Windows paths are also handled:
path.isAbsolute("C:\\Users\\me\\file.txt"); // true
path.dirname("C:\\Users\\me\\file.txt"); // "C:/Users/me"
path.normalize("C:\\a\\..\\b"); // "C:/b"
```

## Notes

- **Output is always forward-slash.** `path.join("a", "b")` → `"a/b"` on all
  platforms. The host's [`FileService`](/api/files/) accepts forward-slash paths
  on Windows too.
- **No `path.sep` or `path.delimiter`.** The platform separator is not exposed
  on purpose — extensions should not branch on it. Always write paths with `/`.
- **UNC paths** (`\\server\share`) are supported in `isAbsolute` and `normalize`
  but `relative` between UNC and non-UNC paths is not guaranteed to produce
  meaningful results.

## Types

[`path`](/api/types/variables/path)

## See also

[`ctx.files`](/api/files/) · [Roadmap](/roadmap)

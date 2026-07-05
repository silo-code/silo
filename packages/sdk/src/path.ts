// Pure path utilities for extensions. A cross-platform replacement for
// `node:path`, which extensions are banned from importing (platform ban).
// All outputs use forward-slash separators — the form FileService accepts on
// every platform. Both "/" and "\" are accepted as inputs.

/** Normalize all separators to forward-slash. */
function normSep(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Extract a Windows drive-letter prefix ("C:") from a forward-slash path, or null. */
function parseDrive(p: string): string | null {
  const m = /^([A-Za-z]):/.exec(p);
  return m ? m[1].toUpperCase() + ":" : null;
}

/**
 * Normalize segments of a forward-slash path: collapse duplicate slashes,
 * resolve "." and ".." segments. Preserves leading "/" (POSIX absolute),
 * "C:/" (Windows drive-letter), and "//" (UNC paths).
 */
function normSegments(s: string): string {
  const drive = parseDrive(s);
  const afterDrive = drive ? s.slice(2) : s;
  const isUnc = afterDrive.startsWith("//");
  const isAbs = isUnc || afterDrive.startsWith("/");

  const stack: string[] = [];
  for (const seg of afterDrive.split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (stack.length > 0 && stack[stack.length - 1] !== "..") {
        stack.pop();
      } else if (!isAbs) {
        stack.push("..");
      }
    } else {
      stack.push(seg);
    }
  }

  let result = stack.join("/");
  if (isUnc) result = "//" + result;
  else if (isAbs) result = "/" + result;
  if (drive) result = drive + result;
  if (!result) return isAbs ? (drive ? drive + "/" : "/") : ".";
  return result;
}

/**
 * Path utilities for extensions — a cross-platform replacement for
 * `node:path`, which extensions are banned from importing. All output paths
 * use forward-slash separators (the form {@link FileService} accepts on every
 * platform). Both `/` and `\` are accepted as input separators.
 *
 * @example
 * ```ts
 * import { path } from "@silo-code/sdk";
 *
 * const dir  = path.dirname(filePath);            // "/home/user/docs"
 * const full = path.join(dir, "images/fig.png");  // "/home/user/docs/images/fig.png"
 * const rel  = path.relative(dir, full);           // "images/fig.png"
 * const ext  = path.extname(full);                 // ".png"
 * ```
 *
 * @category Core Types
 * @public
 */
export const path: {
  /**
   * Join path segments and normalize the result. Empty segments are ignored;
   * `\` separators in any segment are treated as `/`.
   */
  join(...parts: string[]): string;
  /**
   * Return the directory portion of a path — everything up to (not including)
   * the last `/`. Returns `"."` for a bare filename with no directory component.
   */
  dirname(p: string): string;
  /**
   * Return the final component of a path. If `ext` is supplied and the
   * basename ends with that string, it is stripped from the result.
   */
  basename(p: string, ext?: string): string;
  /**
   * Return the extension of a path — the portion from the last `.` of the
   * basename, including the dot. Returns `""` for paths with no extension and
   * for dotfiles with no secondary extension (e.g. `".gitignore"` → `""`).
   */
  extname(p: string): string;
  /**
   * Compute the relative path from `from` to `to`. Both should be absolute
   * paths on the same drive. When they are on different Windows drive letters,
   * `to` (normalized) is returned unchanged — no relative path exists between
   * drives.
   */
  relative(from: string, to: string): string;
  /**
   * Return `true` if `p` is an absolute path: starts with `/` (POSIX), has a
   * drive letter followed by a slash (`C:/`, `C:\`), or is a UNC path
   * (`\\server\share` / `//server/share`). Note: `C:foo` (drive-relative,
   * no slash) is NOT absolute.
   */
  isAbsolute(p: string): boolean;
  /**
   * Normalize a path: convert `\` to `/`, collapse duplicate slashes, and
   * resolve `.` and `..` segments.
   */
  normalize(p: string): string;
} = {
  normalize(p) {
    return normSegments(normSep(p));
  },

  join(...parts) {
    const nonEmpty = parts.filter((p) => p.length > 0);
    if (nonEmpty.length === 0) return ".";
    // Concatenate without adding "/" when adjacent parts already supply the
    // boundary, so join("/", "rel") → "/rel" rather than "//rel" (UNC).
    const raw = nonEmpty.map(normSep).reduce((a, b) => {
      if (a.endsWith("/") || b.startsWith("/")) return a + b;
      return a + "/" + b;
    });
    return normSegments(raw);
  },

  dirname(p) {
    const n = normSegments(normSep(p));
    const drive = parseDrive(n);
    const rest = drive ? n.slice(2) : n;
    const i = rest.lastIndexOf("/");
    if (i < 0) return drive ? drive + "." : ".";
    if (i === 0) return drive ? drive + "/" : "/";
    return drive ? drive + rest.slice(0, i) : rest.slice(0, i);
  },

  basename(p, ext) {
    const n = normSep(p);
    const segs = n.split("/");
    let name = segs[segs.length - 1] ?? "";
    // Trailing slash: "foo/" → last segment is "" → fall back to prior segment
    if (name === "" && segs.length > 1) name = segs[segs.length - 2] ?? "";
    if (ext !== undefined && name.endsWith(ext)) {
      name = name.slice(0, name.length - ext.length);
    }
    return name;
  },

  extname(p) {
    const base = path.basename(normSep(p));
    const i = base.lastIndexOf(".");
    // i === 0 means a dotfile like ".gitignore" — no extension
    if (i <= 0) return "";
    return base.slice(i);
  },

  isAbsolute(p) {
    const n = normSep(p);
    if (n.startsWith("//")) return true; // UNC (\\server\share or //server/share)
    if (/^[A-Za-z]:\//.test(n)) return true; // Windows drive with slash (C:/ or C:\)
    return n.startsWith("/"); // POSIX
  },

  relative(from, to) {
    const nFrom = normSegments(normSep(from));
    const nTo = normSegments(normSep(to));
    const driveFrom = parseDrive(nFrom);
    const driveTo = parseDrive(nTo);
    // Can't express a relative path across different drives
    if (driveFrom !== driveTo) return nTo;
    const segsFrom = (driveFrom ? nFrom.slice(2) : nFrom)
      .split("/")
      .filter(Boolean);
    const segsTo = (driveTo ? nTo.slice(2) : nTo).split("/").filter(Boolean);
    let common = 0;
    while (
      common < segsFrom.length &&
      common < segsTo.length &&
      segsFrom[common] === segsTo[common]
    ) {
      common++;
    }
    const ups = segsFrom.length - common;
    const downs = segsTo.slice(common);
    const parts = [...Array<string>(ups).fill(".."), ...downs];
    return parts.join("/") || ".";
  },
};

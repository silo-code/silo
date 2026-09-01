/**
 * Pure path-scoping logic for `ctx.files` / `ctx.process`. Given an extension's
 * {@link PathScope} (the workspace roots, its trust tier, and the capabilities
 * the user granted), decide whether a path is allowed and resolve it to the
 * absolute path the host fs commands expect.
 *
 * This is the JS-side enforcement of ADR 0015 phase 2 (workspace path-scoping):
 * honest-mistake containment + the chokepoint a capability grant lifts. It is
 * **not** a sandbox — in-realm code can bypass `ctx` entirely (see RFC 0006) — so
 * it constrains the `ctx.files`/`ctx.process` surface, nothing more.
 *
 * No Tauri or platform imports. Paths are normalized to a forward-slash form and
 * compared structurally: a POSIX root (`/`), a Windows drive (`C:/`, `C:\`), and
 * a UNC prefix (`//`, `\\`) are each recognized as an absolute anchor that `..`
 * cannot ascend above. This matters on Windows because `ctx.storage.globalDir()`
 * / `workspaceDir()` (RFC 0032) hand an untrusted extension a drive-absolute
 * path back: treating `C:/…` as relative would splice it onto the workspace root
 * and every own-dir write would fail (`ERROR_INVALID_NAME`). Kept pure so the
 * rules are exhaustively unit-testable.
 *
 * @internal
 */
import { PathDeniedError } from "@silo-code/sdk";
import type { Permission } from "@silo-code/sdk";

/** Read vs. write — selects which `fs:*` permission lifts an out-of-scope path. */
export type Access = "read" | "write";

/**
 * What an extension is scoped to. Derived per-extension in `createContext`;
 * `roots` is read live so it tracks the active workspace.
 */
export interface PathScope {
  /**
   * Absolute workspace root folders, primary first. Relative paths resolve
   * against `roots[0]`. Empty when no workspace is open (every out-of-nothing
   * path is then denied for untrusted extensions).
   */
  readonly roots: readonly string[];
  /**
   * This extension's own storage directories (RFC 0032) — always allowed, read
   * or write, with no `fs:*` permission. Absolute paths from
   * `ctx.storage.globalDir()` / `workspaceDir()`; read live so the workspace
   * one tracks the active workspace. Empty before the storage root resolves at
   * startup (and if resolving it failed), which denies through the normal rules.
   */
  readonly ownDirs: readonly string[];
  /** First-party (bundled) extensions are unscoped — every call passes through. */
  readonly trusted: boolean;
  /** Capabilities the user granted at install. */
  readonly permissions: ReadonlySet<Permission>;
}

/**
 * True if `p` is an absolute path: a POSIX root (`/`), a Windows drive letter
 * followed by a separator (`C:/`, `C:\`), or a UNC path (`//`, `\\`). A
 * drive-relative `C:foo` (no separator) is **not** absolute.
 */
export function isAbsolutePath(p: string): boolean {
  const s = p.replace(/\\/g, "/");
  return s.startsWith("/") || /^[A-Za-z]:\//.test(s);
}

/**
 * Normalize a path to forward-slash form: convert `\` to `/`, collapse `//`,
 * drop `.`, and resolve `..` segments. Three anchors are recognized as absolute
 * and `..` can never ascend above them — a POSIX root (`/`), a Windows drive
 * (`C:/`), and a UNC prefix (`//`). A relative path keeps its leading `..`. The
 * drive letter is upper-cased so containment comparisons are case-insensitive on
 * it, as Windows drive letters are.
 *
 * Kept self-contained rather than routed through the SDK's `path.normalize` (its
 * close twin) so this security boundary's rules stay auditable in one file with
 * no cross-package coupling.
 */
export function normalizePath(input: string): string {
  const path = input.replace(/\\/g, "/");
  const driveMatch = /^([A-Za-z]):\//.exec(path);
  const drive = driveMatch ? `${driveMatch[1].toUpperCase()}:` : "";
  const afterDrive = drive ? path.slice(drive.length) : path;
  const isUnc = !drive && afterDrive.startsWith("//");
  const isAbsolute = drive !== "" || afterDrive.startsWith("/");

  const stack: string[] = [];
  for (const segment of afterDrive.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      const top = stack[stack.length - 1];
      if (stack.length && top !== "..") stack.pop();
      else if (!isAbsolute) stack.push("..");
      // absolute + nothing to pop → stay at the anchor
    } else {
      stack.push(segment);
    }
  }
  const joined = stack.join("/");
  if (drive) return `${drive}/${joined}`;
  if (isUnc) return `//${joined}`;
  return isAbsolute ? `/${joined}` : joined;
}

/**
 * Resolve `rawPath` to an absolute, normalized path. A relative path resolves
 * against the primary root; returns `null` if it's relative and there's no root
 * to resolve against (no workspace open).
 */
export function toAbsolute(
  roots: readonly string[],
  rawPath: string,
): string | null {
  if (isAbsolutePath(rawPath)) return normalizePath(rawPath);
  const base = roots[0];
  if (base === undefined) return null;
  return normalizePath(`${base}/${rawPath}`);
}

/**
 * True if the absolute, normalized `path` is a root or nested under one. Both
 * sides are re-normalized (so a raw root with a trailing slash or `\` separators
 * still compares correctly), which also upper-cases a Windows drive letter on
 * both — `c:/work` and `C:/work` are the same root.
 */
export function withinRoots(roots: readonly string[], path: string): boolean {
  const target = normalizePath(path);
  for (const root of roots) {
    const r = normalizePath(root);
    const prefix = r.endsWith("/") ? r : `${r}/`;
    if (target === r || target.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Enforce `scope` on `rawPath` and return the absolute path to hand to the host.
 * Trusted extensions pass through untouched. Otherwise the path must resolve
 * inside a workspace root, or inside one of the extension's own storage
 * directories ({@link PathScope.ownDirs}) — unless the extension holds the
 * `fs:read` (for reads) or `fs:write` (for writes) permission. Throws
 * {@link PathDeniedError} when it doesn't.
 *
 * Note the own-dir check comes **after** `toAbsolute` but is otherwise
 * independent of the workspace: an extension with no workspace open still
 * reaches its own global directory (an own-dir path is always absolute, so it
 * never hits the "no workspace to resolve against" branch). Relative paths are
 * unaffected — they still resolve against `roots[0]`, never against an own dir.
 */
export function resolvePath(
  scope: PathScope,
  rawPath: string,
  access: Access,
): string {
  if (scope.trusted) return rawPath;

  const abs = toAbsolute(scope.roots, rawPath);
  if (abs === null) {
    throw new PathDeniedError(
      rawPath,
      `Cannot resolve "${rawPath}": no workspace is open`,
    );
  }
  if (withinRoots(scope.ownDirs, abs)) return abs;
  if (withinRoots(scope.roots, abs)) return abs;

  const needed: Permission = access === "write" ? "fs:write" : "fs:read";
  if (scope.permissions.has(needed)) return abs;

  throw new PathDeniedError(
    rawPath,
    `Path is outside the workspace (needs "${needed}"): ${rawPath}`,
  );
}

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
 * No Tauri or platform imports: paths are treated as POSIX (Silo's terminals and
 * fs are Unix-only for now; Windows scoping is future work). Kept pure so the
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
  /** First-party (bundled) extensions are unscoped — every call passes through. */
  readonly trusted: boolean;
  /** Capabilities the user granted at install. */
  readonly permissions: ReadonlySet<Permission>;
}

/**
 * Normalize a POSIX path: collapse `//`, drop `.`, and resolve `..` segments.
 * An absolute path can't ascend above `/`; a relative one keeps leading `..`.
 */
export function normalizePosix(path: string): string {
  const isAbsolute = path.startsWith("/");
  const stack: string[] = [];
  for (const segment of path.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      const top = stack[stack.length - 1];
      if (stack.length && top !== "..") stack.pop();
      else if (!isAbsolute) stack.push("..");
      // absolute + nothing to pop → stay at root
    } else {
      stack.push(segment);
    }
  }
  const joined = stack.join("/");
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
  if (rawPath.startsWith("/")) return normalizePosix(rawPath);
  const base = roots[0];
  if (base === undefined) return null;
  return normalizePosix(`${base}/${rawPath}`);
}

/** True if the absolute, normalized `path` is a root or nested under one. */
export function withinRoots(roots: readonly string[], path: string): boolean {
  for (const root of roots) {
    const r = normalizePosix(root);
    const prefix = r === "/" ? "/" : `${r}/`;
    if (path === r || path.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Enforce `scope` on `rawPath` and return the absolute path to hand to the host.
 * Trusted extensions pass through untouched. Otherwise the path must resolve
 * inside a workspace root — unless the extension holds the `fs:read` (for reads)
 * or `fs:write` (for writes) permission. Throws {@link PathDeniedError} when it
 * doesn't.
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
  if (withinRoots(scope.roots, abs)) return abs;

  const needed: Permission = access === "write" ? "fs:write" : "fs:read";
  if (scope.permissions.has(needed)) return abs;

  throw new PathDeniedError(
    rawPath,
    `Path is outside the workspace (needs "${needed}"): ${rawPath}`,
  );
}

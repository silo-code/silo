// The extension permission surface — what an extension may declare it needs
// (`silo.permissions` in its manifest) and the error the host throws when an
// extension reaches outside the workspace without the matching grant. See the
// "Permissions & access" guide and ADR 0015 (phased security model).

/**
 * A capability an extension declares in its manifest (`silo.permissions`) to
 * request access **beyond the open workspace**. With none declared, an
 * extension's {@link FileService} / {@link ProcessService} access is confined to
 * the workspace folder(s); each permission lifts one part of that confinement,
 * and the user consents to the set at install.
 *
 * - `fs:read` — read files outside the workspace.
 * - `fs:write` — write files outside the workspace.
 * - `process` — run commands with a working directory outside the workspace.
 * - `network` — make outbound network requests. Declarative consent only until
 *   sandboxed execution lands (in-process code can reach the network directly);
 *   declare it so the capability is reviewable and shown at install.
 * - `webview` — use {@link ExtensionContext.webview} to get real DOM access,
 *   script execution, and native pixel capture inside an iframe you own,
 *   including cross-origin content. Declare it because this reaches into
 *   arbitrary embedded pages, not because it touches the filesystem/network
 *   directly.
 *
 * @category Extension Contract
 * @public
 */
export type Permission =
  | "fs:read"
  | "fs:write"
  | "process"
  | "network"
  | "webview";

/**
 * Thrown by {@link FileService} and {@link ProcessService} when an extension
 * touches a path — or runs a process with a working directory — outside the open
 * workspace without the matching {@link Permission}. Catch it and degrade
 * gracefully, the same way you'd handle a missing file:
 *
 * ```ts
 * try {
 *   const text = await ctx.files.readText(path);
 * } catch (err) {
 *   if (err instanceof PathDeniedError) showMessage("That file is outside the workspace.");
 * }
 * ```
 *
 * @category Core Types
 * @public
 */
export class PathDeniedError extends Error {
  /** The offending path, exactly as the extension passed it. */
  readonly path: string;

  constructor(path: string, message?: string) {
    super(message ?? `Path is outside the workspace: ${path}`);
    this.name = "PathDeniedError";
    this.path = path;
    // Restore the prototype chain so `instanceof` works across the down-leveled
    // class output the SDK ships (and across the host↔extension boundary, where
    // there's a single shared SDK instance).
    Object.setPrototypeOf(this, PathDeniedError.prototype);
  }
}

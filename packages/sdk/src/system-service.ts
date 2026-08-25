// `ctx.system` — static host-platform metadata: OS, CPU architecture, and the
// running Silo version. Values are baked in at build time and never change
// during a session, so the result of getInfo() is cached after the first call.

/**
 * A point-in-time snapshot of the host machine and application version.
 * Returned by {@link SystemService.getInfo}. All fields are static for the
 * lifetime of the app — cache freely.
 *
 * @category Consumer Services
 * @public
 */
export interface SystemInfo {
  /**
   * The host operating system.
   *
   * - `"macos"` — macOS (Apple Silicon or Intel)
   * - `"linux"` — Linux
   * - `"windows"` — Windows
   */
  os: "macos" | "linux" | "windows";
  /**
   * The CPU architecture the app binary was compiled for, e.g. `"aarch64"` or
   * `"x86_64"`. Uses Rust's `std::env::consts::ARCH` vocabulary — common values
   * on Silo's targets are `"aarch64"` (Apple Silicon, ARM) and `"x86_64"` (Intel
   * / AMD64).
   */
  arch: string;
  /**
   * The running Silo application version from the bundle manifest, e.g.
   * `"0.15.0"`.
   */
  siloVersion: string;
}

/**
 * Read-only snapshot of the host machine and Silo version. Exposed as
 * {@link ExtensionContext.system}.
 *
 * All values are static — they are baked into the binary at compile time and
 * do not change during a session. `getInfo()` resolves on the first call and
 * returns the cached result on every subsequent call.
 *
 * @example
 * ```ts
 * export const extension: Extension = {
 *   id: "my.platform-aware",
 *   async activate(ctx) {
 *     const { os, arch, siloVersion } = await ctx.system.getInfo();
 *
 *     if (os === "macos") {
 *       // Register a macOS-specific command.
 *       ctx.subscriptions.push(
 *         ctx.registerCommand({
 *           id: "my.reveal-in-finder",
 *           label: "Reveal in Finder",
 *           run() { ... },
 *         }),
 *       );
 *     }
 *
 *     ctx.ui.notify("info", `Running Silo ${siloVersion} on ${os}/${arch}`);
 *   },
 * };
 * ```
 *
 * @category Consumer Services
 * @public
 */
export interface SystemService {
  /**
   * Resolve the host-platform snapshot. Resolves immediately after the first
   * call (the result is cached) — safe to `await` in `activate`.
   */
  getInfo(): Promise<SystemInfo>;
  /**
   * Absolute path of the current user's home directory (`$HOME` on
   * macOS/Linux, `%USERPROFILE%` on Windows). Host-mediated — there's no
   * Node/`os` access in extensions. Resolves immediately after the first call
   * (cached, like {@link SystemService.getInfo}).
   *
   * Returning the path string is not itself a file read: reading or watching
   * anything under it still goes through {@link ExtensionContext.files} and
   * that service's normal permission rules (typically `fs:read` for an
   * untrusted extension).
   *
   * @example
   * ```ts
   * const home = await ctx.system.homeDir();
   * const skillsDir = path.join(home, ".claude", "skills");
   * if (await ctx.files.pathExists(skillsDir)) {
   *   const entries = await ctx.files.readDir(skillsDir);
   * }
   * ```
   */
  homeDir(): Promise<string>;
}

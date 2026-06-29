/**
 * Output channel logging — the write-only structured logger extensions receive
 * as {@link ExtensionContext.log}. Each extension gets one channel
 * auto-created at activation and auto-removed at deactivation; no setup is
 * required from the extension author.
 *
 * @packageDocumentation
 */

/**
 * Log severity levels, ordered debug < info < warn < error.
 *
 * @category Consumer Services
 * @public
 */
export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Write-only structured logger automatically scoped to the calling extension.
 * A channel is created for the extension at activation time and removed when
 * the extension deactivates — no setup needed; just call `ctx.log.info("...")`.
 *
 * All entries appear in the **Output** panel (`core.openOutput`) under the
 * extension's display name. Use {@link LogService.show} to focus the panel and
 * select this extension's channel.
 *
 * @category Consumer Services
 * @public
 */
export interface LogService {
  /** Append a debug-level entry. Use for verbose diagnostic output. */
  debug(message: string, data?: unknown): void;
  /** Append an info-level entry. The default level for routine progress. */
  info(message: string, data?: unknown): void;
  /** Append a warn-level entry. Something unexpected but recoverable. */
  warn(message: string, data?: unknown): void;
  /** Append an error-level entry. A failure the user should know about. */
  error(message: string, data?: unknown): void;
  /** Open (or focus) the Output panel and select this extension's channel. */
  show(): void;
  /** Clear this extension's output channel entries. */
  clear(): void;
}

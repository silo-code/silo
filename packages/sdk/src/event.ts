import type { Disposable } from "./types";

/**
 * A subscribable event: call it with a listener and receive a
 * {@link Disposable} that cancels the subscription. Modeled on VS Code's
 * `Event<T>` convention.
 *
 * Services that emit events expose a member typed as `Event<T>` — the
 * consuming extension calls it directly and pushes the returned disposable
 * onto `ctx.subscriptions`:
 *
 * @example
 * ```ts
 * ctx.subscriptions.push(
 *   ctx.editors.onDidSave(({ editorId, filePath }) => {
 *     console.log("saved", filePath);
 *   }),
 * );
 * ```
 *
 * **Host-side:** the matching emitter (`EventEmitter<T>`) lives in the
 * extension-host package (not the SDK). Only the subscribable `Event<T>` type
 * is public — extensions never construct emitters.
 *
 * @category Core Types
 * @public
 */
export type Event<T> = (listener: (e: T) => void) => Disposable;

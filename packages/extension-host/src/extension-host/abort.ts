// Shared abort/cancellation helper for host services that accept an
// `AbortSignal` (e.g. `ctx.search.search`, `ctx.process.exec`). Rejections use
// an `Error` whose `name` is `"AbortError"`, matching the web `fetch`
// convention so callers can branch on `err.name === "AbortError"`.

/** An `Error` with `name === "AbortError"`, for aborted/timed-out operations. */
export function abortError(message = "The operation was aborted"): Error {
  const err = new Error(message);
  err.name = "AbortError";
  return err;
}

/**
 * Wrap a promise so that aborting `signal` rejects the returned promise with an
 * {@link abortError} — while the underlying `work` runs to completion and its
 * result is discarded. Use when the backend cannot itself be interrupted
 * (e.g. a `spawn_blocking` search): cancellation is observable to the caller
 * immediately, but native work may still finish in the background.
 *
 * Returns `work` unchanged when no signal is supplied.
 */
export function raceAbort<T>(
  work: Promise<T>,
  signal: AbortSignal | undefined,
  message?: string,
): Promise<T> {
  if (!signal) return work;
  if (signal.aborted) {
    // Swallow the in-flight work's eventual settle so it can't become an
    // unhandled rejection; the caller only sees the abort.
    void work.catch(() => {});
    return Promise.reject(abortError(message));
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(abortError(message));
    signal.addEventListener("abort", onAbort, { once: true });
    work.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        if (!signal.aborted) resolve(value);
      },
      (err) => {
        signal.removeEventListener("abort", onAbort);
        if (!signal.aborted) reject(err);
      },
    );
  });
}

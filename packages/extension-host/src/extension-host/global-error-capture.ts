import { createHostChannel } from "./output-store";

// Lazy — the channel only appears in the Output dropdown when an error fires.
let channel: ReturnType<typeof createHostChannel> | null = null;
function getChannel() {
  if (!channel) channel = createHostChannel("silo:errors", "System Errors");
  return channel;
}

/**
 * Write directly to the silo:errors channel. Use this for host-code errors
 * that have structured context (e.g. extension ID) rather than a raw stack.
 */
export function reportError(
  message: string,
  data?: Record<string, unknown>,
): void {
  getChannel().error(message, data);
}

/**
 * Install global handlers for unhandled promise rejections and uncaught
 * synchronous exceptions. Both are routed to the `silo:errors` Output channel
 * so they're visible in the UI (with stack traces) rather than only in Tauri
 * system logs where the source is hard to trace.
 *
 * Does NOT suppress the errors — they still propagate to Tauri's logger and
 * the browser console. This is purely additive visibility.
 */
export function initGlobalErrorCapture(): void {
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      reason instanceof Error ? reason.message : String(reason ?? "unknown");
    const stack =
      reason instanceof Error ? (reason.stack ?? undefined) : undefined;
    getChannel().error(message, stack ? { stack } : undefined);
  });

  window.addEventListener("error", (event) => {
    // Resource-load failures (missing image, script 404, etc.) have no
    // event.error and no event.message — skip them.
    if (!event.error && !event.message) return;
    const stack = (event.error as Error | undefined)?.stack ?? undefined;
    const source = event.filename
      ? `${event.filename}:${event.lineno}:${event.colno}`
      : undefined;
    getChannel().error(event.message || "Uncaught error", {
      ...(source && { source }),
      ...(stack && { stack }),
    });
  });
}

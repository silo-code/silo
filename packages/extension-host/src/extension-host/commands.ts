import { Registry } from "./registry";
import type { Command } from "@silo-code/sdk";
import { isKeybindingCaptureActive } from "./keymap";

export const commandRegistry = new Registry<Command>();

/**
 * @internal — fire-and-forget dispatch used by keybinding and menu-item paths.
 * Synchronous commands run synchronously before this returns; async commands
 * have their rejection routed to console so they never surface as an
 * unhandled-rejection warning.
 */
export function executeCommand(id: string, ...args: unknown[]): boolean {
  // Keyboard Shortcuts capture mode: swallow dispatch so the chord is recorded
  // instead of running (covers native-menu accelerators too).
  if (isKeybindingCaptureActive()) return false;
  const cmd = commandRegistry.get(id);
  if (!cmd) {
    console.warn(`[extensions] unknown command: ${id}`);
    return false;
  }
  try {
    const result = cmd.run(...args);
    if (result instanceof Promise) {
      result.catch((err) =>
        console.error(`[extensions] command failed: ${id}`, err),
      );
    }
  } catch (err) {
    console.error(`[extensions] command failed: ${id}`, err);
    return false;
  }
  return true;
}

/**
 * @internal — Promise-returning dispatch used by `ctx.executeCommand`. Sync
 * commands run synchronously before the promise settles; async commands are
 * awaited. Rejects for unknown ids or commands that throw/reject — but a
 * rejection handler is always attached before returning, so the common
 * fire-and-forget call style (`ctx.executeCommand(id)` with no `await`) never
 * surfaces as an unhandled-rejection warning. Callers that `await` still
 * receive the same rejection.
 */
export function executeCommandAsync<T = unknown>(
  id: string,
  ...args: unknown[]
): Promise<T> {
  if (isKeybindingCaptureActive()) {
    return Promise.resolve(undefined as T);
  }
  const cmd = commandRegistry.get(id);
  let result: Promise<T>;
  if (!cmd) {
    result = Promise.reject(new Error(`Unknown command: ${id}`));
  } else {
    try {
      result = Promise.resolve(cmd.run(...args)) as Promise<T>;
    } catch (err) {
      result = Promise.reject(err);
    }
  }
  result.catch((err) =>
    console.error(`[extensions] command failed: ${id}`, err),
  );
  return result;
}

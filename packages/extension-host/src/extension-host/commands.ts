import { Registry } from "./registry";
import type { Command } from "@silo-code/sdk";

export const commandRegistry = new Registry<Command>();

/**
 * @internal — fire-and-forget dispatch used by keybinding and menu-item paths.
 * Synchronous commands run synchronously before this returns; async commands
 * have their rejection routed to console so they never surface as an
 * unhandled-rejection warning.
 */
export function executeCommand(id: string, ...args: unknown[]): boolean {
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
 * awaited. Rejects for unknown ids or commands that throw/reject.
 */
export function executeCommandAsync<T = unknown>(
  id: string,
  ...args: unknown[]
): Promise<T> {
  const cmd = commandRegistry.get(id);
  if (!cmd) {
    return Promise.reject(new Error(`Unknown command: ${id}`));
  }
  try {
    return Promise.resolve(cmd.run(...args)) as Promise<T>;
  } catch (err) {
    return Promise.reject(err);
  }
}

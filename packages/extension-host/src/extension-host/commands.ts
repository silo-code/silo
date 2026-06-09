import { Registry } from "./registry";
import type { Command } from "@silo-code/sdk";

export const commandRegistry = new Registry<Command>();

export function executeCommand(id: string): boolean {
  const cmd = commandRegistry.get(id);
  if (!cmd) {
    console.warn(`[extensions] unknown command: ${id}`);
    return false;
  }
  try {
    cmd.run();
  } catch (err) {
    console.error(`[extensions] command failed: ${id}`, err);
    return false;
  }
  return true;
}

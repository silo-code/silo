import { displayKey, effectiveKey, isRemoved } from "./keymap";

/** Context-menu accelerator label for a command's effective key, if bound. */
export function menuAcceleratorForCommand(command: string): string | undefined {
  if (isRemoved(command)) return undefined;
  const key = effectiveKey(command);
  return key ? displayKey(key) : undefined;
}

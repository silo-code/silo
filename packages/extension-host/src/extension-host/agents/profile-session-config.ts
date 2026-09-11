/**
 * Profile-stored Chat session config defaults — pure helpers shared by the
 * connect path and the profile editor.
 */

import type { AgentSessionConfigOption } from "@silo-code/sdk";

/** Which stored defaults still need applying after `session/new`. */
export function sessionConfigToApply(
  sessionConfig: Readonly<Record<string, string>> | undefined,
  configOptions: readonly AgentSessionConfigOption[],
): ReadonlyArray<{ id: string; value: string }> {
  if (!sessionConfig) return [];
  const out: { id: string; value: string }[] = [];
  for (const [id, value] of Object.entries(sessionConfig)) {
    const option = configOptions.find((o) => o.id === id);
    if (!option) continue;
    if (!option.options.some((c) => c.value === value)) continue;
    if (option.currentValue === value) continue;
    out.push({ id, value });
  }
  return out;
}

/** Drop keys that no longer match anything the agent advertised. */
export function pruneSessionConfig(
  sessionConfig: Readonly<Record<string, string>>,
  configOptions: readonly AgentSessionConfigOption[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [id, value] of Object.entries(sessionConfig)) {
    const option = configOptions.find((o) => o.id === id);
    if (!option) continue;
    if (!option.options.some((c) => c.value === value)) continue;
    out[id] = value;
  }
  return out;
}

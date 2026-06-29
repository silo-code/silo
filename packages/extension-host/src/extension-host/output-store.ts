/**
 * Per-channel output log store — the valtio proxy that backs the Output panel
 * (`core.output`). Each channel maintains an independent ring buffer so a
 * noisy source cannot crowd out entries from other channels.
 *
 * The write path is via `ctx.log` (public SDK) and `createHostChannel`
 * (host-internal, for built-in channels like `silo:notifications`). The read
 * path is `outputStore`, exported to `core.*` via `sdk-internal.ts`.
 *
 * Channel key scheme:
 *   `silo:application` — shared channel for all `core.*` built-in extensions
 *   `silo:<name>` — other host channels (notifications, future lint/build)
 *   `ext:<extensionId>` — one auto-managed channel per third-party extension
 */

import { proxy } from "valtio";
import type { LogLevel } from "@silo-code/sdk";

/** Maximum entries per channel before the oldest are silently dropped. */
export const MAX_CHANNEL_ENTRIES = 5_000;

/**
 * A single log entry in an output channel.
 * @internal
 */
export interface OutputEntry {
  /** Monotonic, unique per entry across all channels. */
  id: number;
  level: LogLevel;
  message: string;
  /** Optional structured payload — rendered as JSON in the panel. */
  data?: unknown;
  /** Unix epoch milliseconds from Date.now(). */
  timestamp: number;
}

/**
 * The state for one named output channel.
 * @internal
 */
export interface OutputChannelState {
  key: string;
  displayName: string;
  entries: OutputEntry[];
  /** True for first-party bundled extensions (trusted); false/absent for third-party. */
  builtin?: boolean;
}

/**
 * Reactive output store. The `order` array preserves insertion order so the
 * channel dropdown is stable across re-renders.
 * @internal
 */
export const outputStore = proxy<{
  channels: Record<string, OutputChannelState>;
  order: string[];
}>({ channels: {}, order: [] });

let nextId = 0;

/** Register a channel; idempotent if the key already exists. @internal */
export function registerChannel(
  key: string,
  displayName: string,
  builtin?: boolean,
): void {
  if (outputStore.channels[key]) return;
  outputStore.channels[key] = { key, displayName, entries: [], builtin };
  outputStore.order.push(key);
}

/** Remove a channel and its entries. @internal */
export function unregisterChannel(key: string): void {
  delete outputStore.channels[key];
  outputStore.order = outputStore.order.filter((k) => k !== key);
}

/** Append an entry to a channel, trimming oldest if over the cap. @internal */
export function pushEntry(
  key: string,
  level: LogLevel,
  message: string,
  data?: unknown,
): void {
  const ch = outputStore.channels[key];
  if (!ch) return;
  if (ch.entries.length >= MAX_CHANNEL_ENTRIES) {
    ch.entries.splice(0, ch.entries.length - MAX_CHANNEL_ENTRIES + 1);
  }
  const entry: OutputEntry = {
    id: nextId++,
    level,
    message,
    timestamp: Date.now(),
  };
  if (data !== undefined) entry.data = data;
  ch.entries.push(entry);
}

/** Remove all entries from a channel. @internal */
export function clearChannel(key: string): void {
  const ch = outputStore.channels[key];
  if (ch) ch.entries.splice(0, ch.entries.length);
}

/**
 * Create a host-owned output channel (e.g. `silo:notifications`).
 * Exported via `sdk-internal.ts` for use by host services that need to write
 * to the Output panel without going through `ctx.log`.
 * @internal
 */
export function createHostChannel(key: string, displayName: string) {
  registerChannel(key, displayName);
  return {
    debug: (msg: string, data?: unknown) => pushEntry(key, "debug", msg, data),
    info: (msg: string, data?: unknown) => pushEntry(key, "info", msg, data),
    warn: (msg: string, data?: unknown) => pushEntry(key, "warn", msg, data),
    error: (msg: string, data?: unknown) => pushEntry(key, "error", msg, data),
    clear: () => clearChannel(key),
  };
}

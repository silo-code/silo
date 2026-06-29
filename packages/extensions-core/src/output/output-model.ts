import type { LogLevel } from "@silo-code/sdk";
import type {
  OutputChannelState,
  OutputEntry,
} from "@silo-code/extension-host/internal";

export interface OutputFilter {
  level: LogLevel | "all";
  search: string;
}

/**
 * Filter entries by level and/or substring search on the message.
 * Returns the original array reference unchanged when both dimensions are
 * at their defaults (stable identity for React memo/useEffect deps).
 */
export function filterEntries(
  entries: readonly OutputEntry[],
  filter: OutputFilter,
): readonly OutputEntry[] {
  if (filter.level === "all" && filter.search === "") return entries;
  const lq = filter.search.toLowerCase();
  return entries.filter((e) => {
    if (filter.level !== "all" && e.level !== filter.level) return false;
    if (lq && !e.message.toLowerCase().includes(lq)) return false;
    return true;
  });
}

/** Format a Unix epoch millisecond timestamp as HH:MM:SS (24-hour, zero-padded). */
export function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/**
 * Format selected entries as plain text for clipboard copy.
 * Each entry becomes `HH:MM:SS [LEVEL] message`, with optional data on the next line.
 */
export function copyEntries(entries: readonly OutputEntry[]): string {
  return entries
    .map((e) => {
      const level = e.level.toUpperCase().padEnd(5);
      let line = `${formatTimestamp(e.timestamp)} [${level}] ${e.message}`;
      if (e.data !== undefined) {
        const data =
          typeof e.data === "string" ? e.data : JSON.stringify(e.data, null, 2);
        line += `\n${data}`;
      }
      return line;
    })
    .join("\n");
}

export interface ChannelOption {
  key: string;
  displayName: string;
}

export interface GroupedChannelOptions {
  /** `silo:*` host channels — rendered flat with no group header. */
  host: ChannelOption[];
  /** `ext:silo.*` first-party bundled extensions — "Built-in Extensions" group. */
  builtinExtensions: ChannelOption[];
  /** All other `ext:*` channels — "Extensions" group. */
  extensions: ChannelOption[];
}

/**
 * Build the ordered channel list for the dropdown selector, split into three
 * groups:
 *   - `silo:*`             → host channels, rendered flat with no group header
 *   - `ext:*` + builtin    → first-party bundled extensions ("Built-in Extensions")
 *   - `ext:*` + !builtin   → third-party installed extensions ("Extensions")
 *
 * Keys present in `order` but absent from `channels` are skipped safely.
 */
export function channelOptions(
  channels: Record<string, OutputChannelState>,
  order: string[],
): GroupedChannelOptions {
  const host: ChannelOption[] = [];
  const builtinExtensions: ChannelOption[] = [];
  const extensions: ChannelOption[] = [];
  for (const key of order) {
    const ch = channels[key];
    if (!ch) continue;
    const item = { key, displayName: ch.displayName };
    if (key.startsWith("silo:")) {
      host.push(item);
    } else if (ch.builtin) {
      builtinExtensions.push(item);
    } else {
      extensions.push(item);
    }
  }
  return { host, builtinExtensions, extensions };
}

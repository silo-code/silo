/**
 * xterm.js's public `IModes` exposes whether mouse reporting is *on*
 * (`mouseTrackingMode`) but not which encoding a TUI switched it to — SGR
 * (1006), UTF-8 (1005), or urxvt (1015). `SerializeAddon` inherits that gap:
 * its buffer dump replays tracking mode but never the encoding switch, so a
 * modern TUI (which sends the switch once at startup, not on every redraw)
 * comes back from a restore stuck reporting in the legacy default encoding.
 *
 * TerminalPanel tracks the encoding itself via xterm's public CSI-handler API
 * and uses these pure helpers to fold it into the persisted buffer — the same
 * way SerializeAddon already folds in tracking mode — so a plain
 * `term.write()` on restore recovers both.
 */

export type MouseEncoding = 1005 | 1006 | 1015 | null;

/**
 * Reduces one DECSET (`enabled: true`) / DECRST (`enabled: false`) CSI call's
 * params into the next tracked encoding. Non-encoding params (e.g. the
 * tracking-mode params in a combined `?1000;1006h`) are ignored.
 */
export function nextMouseEncoding(
  current: MouseEncoding,
  params: readonly (number | number[])[],
  enabled: boolean,
): MouseEncoding {
  let next = current;
  for (const p of params) {
    if (p !== 1005 && p !== 1006 && p !== 1015) continue;
    if (enabled) next = p;
    else if (next === p) next = null;
  }
  return next;
}

/**
 * Appends the tracked encoding's DECSET to a SerializeAddon dump, unless
 * there's no app-selected encoding or tracking itself isn't currently on
 * (nothing for the encoding to apply to).
 */
export function withRestoredMouseEncoding(
  serialized: string,
  encoding: MouseEncoding,
  mouseTrackingMode: string,
): string {
  if (encoding === null || mouseTrackingMode === "none") return serialized;
  return `${serialized}\x1b[?${encoding}h`;
}

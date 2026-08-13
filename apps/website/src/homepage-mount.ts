/**
 * Homepage mount handoff helpers — keep the SSG SEO shell painted until
 * marketing CSS has applied, then let React replace it in one step.
 */

/** Below-fold shell nodes; hidden by styles.css once `.silo-home` rules load. */
export const SHELL_BELOW_FOLD_SELECTOR =
  ".silo-home.silo-home-shell > footer, .silo-home.silo-home-shell > main > section";

/**
 * Keep `silo-home-shell` on the root until after React's first paint.
 * Removing it first un-hides below-fold SEO HTML for a frame (repro: ~11s flash).
 */
export const REMOVE_SHELL_CLASS_AFTER_REACT_PAINT = true;

/** Set on `.silo-home` in styles.css — not present in home-shell.css alone. */
export const HOME_ACCENT = "#c5c9d2";

/**
 * True when marketing `styles.css` has applied to the homepage root.
 * Uses `--home-accent` (marketing-only) rather than background — the SSG
 * shell already shares the same gradient fill for a seamless first paint.
 */
export function isMarketingCssApplied(homeAccent: string): boolean {
  return homeAccent.trim().toLowerCase() === HOME_ACCENT;
}

export type StyleProbe = {
  homeAccent: string;
};

/** Poll until `probe()` reports marketing styles, or `timeoutMs` elapses. */
export async function waitForMarketingStyles(
  probe: () => StyleProbe,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<boolean> {
  const timeoutMs = opts.timeoutMs ?? 2000;
  const intervalMs = opts.intervalMs ?? 16;
  const start = Date.now();
  for (;;) {
    if (isMarketingCssApplied(probe().homeAccent)) return true;
    if (Date.now() - start >= timeoutMs) return false;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

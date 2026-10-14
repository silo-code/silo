/**
 * How much of the Chat composer's control row gets drawn at the width it
 * actually has.
 *
 * The row carries more than a narrow dock can hold — the profile pill, Attach,
 * one pill per advertised session control (Claude alone contributes four),
 * Auto Accept, Context, and Send. Left to flexbox it shrinks the wrong things:
 * the profile pill wraps to three lines, the captions ellipsize to `MOD…` /
 * `EFF…`, and Context — the least actionable item in the row — never yields at
 * all. So the row picks a **density** instead, shedding detail in a fixed
 * order rather than letting every control degrade at once.
 *
 * Why measure rather than pick a breakpoint: the row's real floor depends on
 * how many controls the agent advertised, which is a runtime fact. Cursor
 * offers mode + model and fits its pills down to ~480px; Claude offers four and
 * needs ~645px. One hard-coded `@container` breakpoint would have to be tuned
 * for the worst case and would send a two-option agent compact ~170px earlier
 * than it needed to go.
 *
 * The decision itself is pure and lives here; `AcpChatPanel`'s
 * `useControlDensity` owns the DOM measuring that feeds it.
 */

/**
 * Densities, roomiest first. Each sheds something the one before it kept:
 *
 * - `full` — every control, Context reading in full (`"222.5k/1000k (22%)"`).
 * - `condensed` — the same controls, Context down to its percentage (`"22%"`).
 *   Context goes first because it is a glanceable stat, not a readout, and
 *   collapsing it buys back ~110px without hiding a control.
 * - `compact` — the pills collapse into one status line (agent name, the
 *   current values as a summary, the percentage) that opens the same choices
 *   in a menu. Nothing is lost, everything is one click further away.
 */
export const CONTROL_DENSITIES = ["full", "condensed", "compact"] as const;

export type ControlDensity = (typeof CONTROL_DENSITIES)[number];

/** The density that always fits — it ellipsizes a single line of text. */
export const TIGHTEST_DENSITY: ControlDensity = "compact";

/**
 * Extra room, in px, the row must have beyond a roomier density's requirement
 * before it will step back up into it.
 *
 * Shedding is immediate — an overflowing row is visibly broken, so there is
 * nothing to gain by waiting. Restoring is deliberately reluctant: without a
 * margin, a row sitting exactly at a threshold flips on every pixel of a drag
 * as the user resizes the dock. One notch of slack is enough to stop that
 * without being perceptible.
 */
export const DENSITY_RESTORE_MARGIN_PX = 24;

/**
 * Measured min-content width of the row at each density. A density missing
 * from the map is treated as fitting — {@link TIGHTEST_DENSITY} is never
 * measured because it is the fallback, and an un-measured density should not
 * be the reason the row collapses.
 */
export type DensityWidths = Partial<Record<ControlDensity, number>>;

/**
 * The roomiest density whose controls still fit in `available` px, holding
 * {@link DENSITY_RESTORE_MARGIN_PX} of hysteresis against `current` so a drag
 * across a threshold doesn't oscillate.
 */
export function chooseControlDensity({
  available,
  required,
  current,
}: {
  /** Content width the row has to work with. */
  available: number;
  /** What each density needs — see {@link DensityWidths}. */
  required: DensityWidths;
  /** What's on screen now; the hysteresis is measured against it. */
  current: ControlDensity;
}): ControlDensity {
  const currentIndex = CONTROL_DENSITIES.indexOf(current);

  for (const [index, density] of CONTROL_DENSITIES.entries()) {
    const need = required[density];
    if (need === undefined) return density;

    // Stepping *up* into a roomier density has to clear the margin; holding
    // the current one or stepping down only has to fit.
    const margin = index < currentIndex ? DENSITY_RESTORE_MARGIN_PX : 0;
    if (need + margin <= available) return density;
  }

  return TIGHTEST_DENSITY;
}

/** Whether `density` draws the pills rather than the collapsed status line. */
export function showsPills(density: ControlDensity): boolean {
  return density !== "compact";
}

/** Whether Context reads in full rather than as a bare percentage. */
export function showsFullContext(density: ControlDensity): boolean {
  return density === "full";
}

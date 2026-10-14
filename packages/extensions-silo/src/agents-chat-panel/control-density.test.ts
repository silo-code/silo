import { describe, expect, it } from "vitest";
import {
  DENSITY_RESTORE_MARGIN_PX,
  chooseControlDensity,
  showsFullContext,
  showsPills,
  type DensityWidths,
} from "./control-density";

/** A roomy agent row: full needs 640, condensed 530, compact always fits. */
const REQUIRED: DensityWidths = { full: 640, condensed: 530 };

describe("chooseControlDensity", () => {
  it("draws everything when the row has room for it", () => {
    expect(
      chooseControlDensity({
        available: 700,
        required: REQUIRED,
        current: "full",
      }),
    ).toBe("full");
  });

  it("sheds Context to a percentage when only the full reading won't fit", () => {
    expect(
      chooseControlDensity({
        available: 560,
        required: REQUIRED,
        current: "full",
      }),
    ).toBe("condensed");
  });

  it("collapses to the status line when the pills themselves won't fit", () => {
    expect(
      chooseControlDensity({
        available: 380,
        required: REQUIRED,
        current: "condensed",
      }),
    ).toBe("compact");
  });

  it("sheds immediately, with no margin to cross", () => {
    // One px under what `full` needs is enough to give up the full reading:
    // an overflowing row is already broken.
    expect(
      chooseControlDensity({
        available: 639,
        required: REQUIRED,
        current: "full",
      }),
    ).toBe("condensed");
  });

  it("holds the tighter density until the margin is cleared", () => {
    // Enough room for `full` on paper, but not enough to have earned it back.
    expect(
      chooseControlDensity({
        available: 640 + DENSITY_RESTORE_MARGIN_PX - 1,
        required: REQUIRED,
        current: "condensed",
      }),
    ).toBe("condensed");
  });

  it("steps back up once the margin is cleared", () => {
    expect(
      chooseControlDensity({
        available: 640 + DENSITY_RESTORE_MARGIN_PX,
        required: REQUIRED,
        current: "condensed",
      }),
    ).toBe("full");
  });

  it("restores one notch at a time rather than jumping the ladder", () => {
    // Room for `condensed` + margin but nowhere near `full` — the row should
    // come back to `condensed`, not overshoot.
    expect(
      chooseControlDensity({
        available: 560,
        required: REQUIRED,
        current: "compact",
      }),
    ).toBe("condensed");
  });

  it("treats an unmeasured density as fitting", () => {
    // First paint, before the probes have been measured: draw everything
    // rather than collapsing on no evidence.
    expect(
      chooseControlDensity({ available: 0, required: {}, current: "full" }),
    ).toBe("full");
  });

  it("falls back to the status line when nothing fits", () => {
    expect(
      chooseControlDensity({
        available: 10,
        required: { ...REQUIRED, compact: 200 },
        current: "compact",
      }),
    ).toBe("compact");
  });
});

describe("density predicates", () => {
  it("draws pills at every density but the status line", () => {
    expect(showsPills("full")).toBe(true);
    expect(showsPills("condensed")).toBe(true);
    expect(showsPills("compact")).toBe(false);
  });

  it("reads Context in full only at the roomiest density", () => {
    expect(showsFullContext("full")).toBe(true);
    expect(showsFullContext("condensed")).toBe(false);
    expect(showsFullContext("compact")).toBe(false);
  });
});

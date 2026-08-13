import { describe, expect, it } from "vitest";
import {
  HOME_ACCENT,
  REMOVE_SHELL_CLASS_AFTER_REACT_PAINT,
  SHELL_BELOW_FOLD_SELECTOR,
  isMarketingCssApplied,
  waitForMarketingStyles,
} from "./homepage-mount";

describe("homepage mount handoff", () => {
  it("keeps the shell class until after React paints (avoids below-fold flash)", () => {
    expect(REMOVE_SHELL_CLASS_AFTER_REACT_PAINT).toBe(true);
  });

  it("detects marketing CSS via --home-accent", () => {
    expect(isMarketingCssApplied(HOME_ACCENT)).toBe(true);
    expect(isMarketingCssApplied("  #C5C9D2 ")).toBe(true);
  });

  it("rejects missing / wrong accent (shell-only CSS)", () => {
    expect(isMarketingCssApplied("")).toBe(false);
    expect(isMarketingCssApplied(" ")).toBe(false);
    expect(isMarketingCssApplied("#11120f")).toBe(false);
  });

  it("waitForMarketingStyles resolves once the probe flips", async () => {
    let ready = false;
    queueMicrotask(() => {
      ready = true;
    });
    const ok = await waitForMarketingStyles(
      () => ({ homeAccent: ready ? HOME_ACCENT : "" }),
      { timeoutMs: 500, intervalMs: 5 },
    );
    expect(ok).toBe(true);
  });

  it("waitForMarketingStyles times out when styles never arrive", async () => {
    const ok = await waitForMarketingStyles(() => ({ homeAccent: "" }), {
      timeoutMs: 40,
      intervalMs: 10,
    });
    expect(ok).toBe(false);
  });

  it("exports a stable below-fold shell selector for styles.css", () => {
    expect(SHELL_BELOW_FOLD_SELECTOR).toContain(".silo-home.silo-home-shell");
    expect(SHELL_BELOW_FOLD_SELECTOR).toContain("footer");
    expect(SHELL_BELOW_FOLD_SELECTOR).toContain("main > section");
  });
});

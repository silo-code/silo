import { describe, expect, it } from "vitest";
import {
  cursorCompositePosition,
  cursorTopYInCrop,
  elementCenterInCrop,
  suggestedVideoBitsPerSecond,
} from "./cursor-composite";
import {
  loopBookendBlurPx,
  loopBookendOpacity,
  normalizeLoopBookendMode,
  wait,
} from "./capture";

describe("wait", () => {
  it("resolves after the delay", async () => {
    const started = Date.now();
    await wait(20);
    expect(Date.now() - started).toBeGreaterThanOrEqual(15);
  });

  it("rejects when aborted before finishing", async () => {
    const controller = new AbortController();
    const done = wait(500, controller.signal);
    controller.abort();
    await expect(done).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("loopBookendOpacity", () => {
  it("stays fully visible mid-clip", () => {
    expect(loopBookendOpacity(500, 2000, 300)).toBe(1);
  });

  it("fades in from the start and out at the end", () => {
    expect(loopBookendOpacity(0, 2000, 300)).toBe(0);
    expect(loopBookendOpacity(150, 2000, 300)).toBeCloseTo(0.5);
    expect(loopBookendOpacity(1850, 2000, 300)).toBeCloseTo(0.5);
    expect(loopBookendOpacity(2000, 2000, 300)).toBe(0);
  });

  it("disables when fadeMs is 0", () => {
    expect(loopBookendOpacity(0, 2000, 0)).toBe(1);
    expect(loopBookendOpacity(2000, 2000, 0)).toBe(1);
  });
});

describe("loopBookendBlurPx", () => {
  it("ramps blur with strength", () => {
    expect(loopBookendBlurPx(0, 28)).toBe(0);
    expect(loopBookendBlurPx(0.5, 28)).toBe(14);
    expect(loopBookendBlurPx(1, 28)).toBe(28);
  });
});

describe("normalizeLoopBookendMode", () => {
  it("accepts dim", () => {
    expect(normalizeLoopBookendMode("dim")).toBe("dim");
  });
});

describe("cursorCompositePosition", () => {
  it("lerps from the origin onto the target", () => {
    expect(
      cursorCompositePosition({ x: 100, y: 200 }, { x: 100, y: 10 }, 0),
    ).toEqual({ x: 100, y: 10 });
    expect(
      cursorCompositePosition({ x: 100, y: 200 }, { x: 100, y: 10 }, 1),
    ).toEqual({ x: 100, y: 200 });
    expect(
      cursorCompositePosition({ x: 100, y: 200 }, { x: 100, y: 10 }, 0.5),
    ).toEqual({ x: 100, y: 105 });
  });

  it("lerps both axes between workspace rows", () => {
    expect(
      cursorCompositePosition({ x: 40, y: 200 }, { x: 40, y: 100 }, 0.5),
    ).toEqual({ x: 40, y: 150 });
  });
});

describe("cursorTopYInCrop", () => {
  it("maps the demo-top percentage into crop pixels", () => {
    // fullHeight 1000, crop starts at y=0.4 → sy=400; top at 2% → 20; crop y = -380
    expect(cursorTopYInCrop({ x: 0, y: 0.4, w: 1, h: 0.6 }, 1000)).toBe(
      20 - 400,
    );
  });
});

describe("elementCenterInCrop", () => {
  it("converts a DOM rect into crop canvas coordinates", () => {
    const root = {
      left: 0,
      top: 0,
      width: 1000,
      height: 500,
      right: 1000,
      bottom: 500,
      x: 0,
      y: 0,
      toJSON() {},
    };
    const el = {
      left: 800,
      top: 400,
      width: 40,
      height: 20,
      right: 840,
      bottom: 420,
      x: 800,
      y: 400,
      toJSON() {},
    };
    // full canvas 2000×1000 (2×); crop right half
    const center = elementCenterInCrop(
      root,
      el,
      { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
      2000,
      1000,
    );
    expect(center).toEqual({
      x: 1640 - 1000, // fullX - sx
      y: 820 - 500,
    });
  });
});

describe("suggestedVideoBitsPerSecond", () => {
  it("floors at 8 Mbps and scales with resolution", () => {
    expect(suggestedVideoBitsPerSecond(320, 180, 30)).toBe(8_000_000);
    expect(suggestedVideoBitsPerSecond(1438, 782, 30)).toBeGreaterThan(
      8_000_000,
    );
  });
});

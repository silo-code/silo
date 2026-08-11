import { describe, expect, it } from "vitest";
import {
  clampZoomAtMs,
  clampZoomEndMs,
  clampZoomSegmentAmong,
  clampZoomWindow,
  easeInOutCubic,
  zoomProgress,
  zoomScaleAtProgress,
  zoomStateAt,
  type ZoomSegment,
} from "./zoom-math";

describe("zoomProgress", () => {
  it("stays at 0 until the zoom start", () => {
    expect(
      zoomProgress({
        absoluteMs: 1500,
        zoomAtMs: 2000,
        zoomEndMs: 5000,
      }),
    ).toBe(0);
  });

  it("reaches 1 at zoom end", () => {
    expect(
      zoomProgress({
        absoluteMs: 5000,
        zoomAtMs: 2000,
        zoomEndMs: 5000,
      }),
    ).toBe(1);
  });

  it("stays at 1 after zoom end (before Out)", () => {
    expect(
      zoomProgress({
        absoluteMs: 7000,
        zoomAtMs: 2000,
        zoomEndMs: 5000,
      }),
    ).toBe(1);
  });

  it("is mid-ease halfway through the zoom span", () => {
    const mid = zoomProgress({
      absoluteMs: 3500,
      zoomAtMs: 2000,
      zoomEndMs: 5000,
    });
    expect(mid).toBeCloseTo(0.5, 5);
  });

  it("accepts localElapsedMs + rangeStartMs", () => {
    expect(
      zoomProgress({
        localElapsedMs: 2500,
        rangeStartMs: 1000,
        zoomAtMs: 2000,
        zoomEndMs: 5000,
      }),
    ).toBeCloseTo(0.5, 5);
  });
});

describe("zoomStateAt", () => {
  const segments: ZoomSegment[] = [
    {
      id: "in",
      startMs: 2000,
      endMs: 4000,
      scale: 2,
      focus: { x: 0.5, y: 0.5 },
      ease: "in-out",
    },
    {
      id: "out",
      startMs: 6000,
      endMs: 8000,
      scale: 1,
      focus: { x: 0.5, y: 0.5 },
      ease: "in-out",
    },
  ];

  it("stays at 1 before the first ramp", () => {
    expect(zoomStateAt(segments, 1000).scale).toBe(1);
  });

  it("is mid-ease halfway through a zoom-in", () => {
    expect(zoomStateAt(segments, 3000).scale).toBeCloseTo(1.5, 5);
  });

  it("holds the peak between ramps", () => {
    expect(zoomStateAt(segments, 5000).scale).toBe(2);
  });

  it("eases back out toward 1", () => {
    expect(zoomStateAt(segments, 7000).scale).toBeCloseTo(1.5, 5);
  });

  it("holds 1 after the zoom-out", () => {
    expect(zoomStateAt(segments, 9000).scale).toBe(1);
  });

  it("uses ease-in (slower start) vs ease-out (faster start)", () => {
    const easeIn: ZoomSegment[] = [
      {
        id: "a",
        startMs: 0,
        endMs: 1000,
        scale: 2,
        focus: { x: 0.5, y: 0.5 },
        ease: "in",
      },
    ];
    const easeOut: ZoomSegment[] = [
      {
        id: "a",
        startMs: 0,
        endMs: 1000,
        scale: 2,
        focus: { x: 0.5, y: 0.5 },
        ease: "out",
      },
    ];
    const midIn = zoomStateAt(easeIn, 500).scale;
    const midOut = zoomStateAt(easeOut, 500).scale;
    expect(midIn).toBeLessThan(1.5);
    expect(midOut).toBeGreaterThan(1.5);
  });

  it("uses linear scale for ease none", () => {
    const segments: ZoomSegment[] = [
      {
        id: "a",
        startMs: 0,
        endMs: 1000,
        scale: 2,
        focus: { x: 0.5, y: 0.5 },
        ease: "none",
      },
    ];
    expect(zoomStateAt(segments, 500).scale).toBeCloseTo(1.5);
  });

  it("pins destination focus for the whole zoom-in (no pan while zooming)", () => {
    const segments: ZoomSegment[] = [
      {
        id: "a",
        startMs: 100,
        endMs: 1100,
        scale: 2,
        focus: { x: 0.2, y: 0.8 },
        ease: "none",
      },
    ];
    expect(zoomStateAt(segments, 0).focus).toEqual({ x: 0.5, y: 0.55 });
    expect(zoomStateAt(segments, 100).focus).toEqual({ x: 0.2, y: 0.8 });
    expect(zoomStateAt(segments, 600).focus).toEqual({ x: 0.2, y: 0.8 });
  });

  it("keeps current focus while zooming out", () => {
    const segments: ZoomSegment[] = [
      {
        id: "in",
        startMs: 0,
        endMs: 500,
        scale: 2,
        focus: { x: 0.2, y: 0.8 },
        ease: "none",
      },
      {
        id: "out",
        startMs: 1000,
        endMs: 2000,
        scale: 1,
        focus: { x: 0.9, y: 0.1 },
        ease: "none",
      },
    ];
    expect(zoomStateAt(segments, 1500).focus).toEqual({ x: 0.2, y: 0.8 });
  });
});

describe("clampZoomSegmentAmong", () => {
  it("keeps a segment from overlapping its neighbor", () => {
    const a: ZoomSegment = {
      id: "a",
      startMs: 1000,
      endMs: 3000,
      scale: 1.5,
      focus: { x: 0.5, y: 0.5 },
    };
    const b: ZoomSegment = {
      id: "b",
      startMs: 2500,
      endMs: 4500,
      scale: 1,
      focus: { x: 0.5, y: 0.5 },
    };
    const next = clampZoomSegmentAmong(b, [a], 0, 10_000);
    expect(next.startMs).toBeGreaterThanOrEqual(a.endMs);
    expect(next.endMs - next.startMs).toBeGreaterThanOrEqual(200);
  });
});

describe("clampZoomWindow", () => {
  it("keeps start before end inside the range", () => {
    expect(clampZoomWindow(50, 9000, 1000, 5000)).toEqual({
      atMs: 1000,
      endMs: 5000,
    });
  });

  it("enforces a minimum span when start is dragged past end", () => {
    const next = clampZoomWindow(4800, 4500, 1000, 5000);
    expect(next.endMs - next.atMs).toBeGreaterThanOrEqual(200);
    expect(next.atMs).toBeLessThan(next.endMs);
  });
});

describe("clampZoomAtMs / clampZoomEndMs", () => {
  it("keeps start inside the clamp window", () => {
    expect(clampZoomAtMs(50, 1000, 5000)).toBe(1000);
    expect(clampZoomAtMs(9000, 1000, 5000)).toBe(4800);
  });

  it("keeps end after start", () => {
    expect(clampZoomEndMs(1500, 1000, 5000, 2000)).toBe(2200);
    expect(clampZoomEndMs(9000, 1000, 5000, 2000)).toBe(5000);
  });
});

describe("pre-zoom outside In→Out", () => {
  it("allows a ramp that finishes before a later In point", () => {
    // Full timeline 0…12s; In might sit at 5s. Pre-zoom 2s→4.5s must survive.
    const segment: ZoomSegment = {
      id: "pre",
      startMs: 2000,
      endMs: 4500,
      scale: 1.6,
      focus: { x: 0.75, y: 0.45 },
      ease: "in",
    };
    const next = clampZoomSegmentAmong(segment, [], 0, 12_000);
    expect(next.startMs).toBe(2000);
    expect(next.endMs).toBe(4500);
    expect(zoomStateAt([next], 5000).scale).toBeCloseTo(1.6);
  });
});

describe("zoomScaleAtProgress", () => {
  it("interpolates toward end scale", () => {
    expect(zoomScaleAtProgress(2, 0)).toBe(1);
    expect(zoomScaleAtProgress(2, 1)).toBe(2);
    expect(zoomScaleAtProgress(2, 0.5)).toBe(1.5);
  });
});

describe("easeInOutCubic", () => {
  it("pins endpoints", () => {
    expect(easeInOutCubic(0)).toBe(0);
    expect(easeInOutCubic(1)).toBe(1);
  });
});

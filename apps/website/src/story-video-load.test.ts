import { describe, expect, it } from "vitest";
import {
  STORY_VIDEO_PRELOAD,
  STORY_VIDEO_ROOT_MARGIN,
  nextStoryVideoLoadState,
  shouldAttachStoryVideoSource,
} from "./story-video-load";

describe("story video load gating", () => {
  it("keeps preload=none so the browser does not eager-fetch WebMs", () => {
    expect(STORY_VIDEO_PRELOAD).toBe("none");
  });

  it("uses a modest rootMargin so clips warm up just before visible", () => {
    expect(STORY_VIDEO_ROOT_MARGIN).toMatch(/px/);
  });

  it("stays idle until near the viewport", () => {
    expect(nextStoryVideoLoadState("idle", false)).toBe("idle");
    expect(nextStoryVideoLoadState("idle", true)).toBe("pending");
  });

  it("does not unload after the source has been attached", () => {
    expect(nextStoryVideoLoadState("pending", false)).toBe("pending");
    expect(nextStoryVideoLoadState("ready", false)).toBe("ready");
    expect(nextStoryVideoLoadState("ready", true)).toBe("ready");
  });

  it("attaches the source only once loading has started", () => {
    expect(shouldAttachStoryVideoSource("idle")).toBe(false);
    expect(shouldAttachStoryVideoSource("pending")).toBe(true);
    expect(shouldAttachStoryVideoSource("ready")).toBe(true);
  });
});

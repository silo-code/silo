/**
 * Feature-story video loading — keep WebMs off the critical path until
 * a clip is near the viewport. Once attached, stay attached (don't tear
 * down on scroll-away; Safari resume logic still needs the element).
 */

export type StoryVideoLoadState = "idle" | "pending" | "ready";

/** Always `none` — we attach `<source>` only when near-viewport. */
export const STORY_VIDEO_PRELOAD = "none" as const;

/** Start fetching slightly before the clip enters view. */
export const STORY_VIDEO_ROOT_MARGIN = "240px 0px";

export function nextStoryVideoLoadState(
  current: StoryVideoLoadState,
  isNearViewport: boolean,
): StoryVideoLoadState {
  if (current === "ready" || current === "pending") return current;
  if (isNearViewport) return "pending";
  return "idle";
}

/** True once we've decided to attach the WebM source. */
export function shouldAttachStoryVideoSource(
  state: StoryVideoLoadState,
): boolean {
  return state === "pending" || state === "ready";
}

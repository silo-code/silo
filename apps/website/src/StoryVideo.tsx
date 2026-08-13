import { useEffect, useRef, useState } from "react";
import {
  STORY_VIDEO_PRELOAD,
  STORY_VIDEO_ROOT_MARGIN,
  nextStoryVideoLoadState,
  shouldAttachStoryVideoSource,
  type StoryVideoLoadState,
} from "./story-video-load";

interface StoryVideoProps {
  webm: string;
  poster: string;
  label: string;
}

/**
 * Mobile Safari silently pauses off-screen/backgrounded `<video>` elements to
 * save power and memory, and — unlike desktop browsers — does not resume
 * `autoplay`/`loop` videos on its own once they scroll back into view. With
 * several feature videos on one long-scrolling page, this shows up as
 * playback that "stops at some point" while scrolling. Re-asserting `.play()`
 * via IntersectionObserver whenever a video re-enters the viewport (or the
 * tab regains visibility) works around it.
 *
 * WebMs are also gated on near-viewport: `preload="none"` and no `<source>`
 * until the observer fires, so the homepage doesn't pull ~7MB of video on
 * first paint.
 */
export function StoryVideo({ webm, poster, label }: StoryVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [loadState, setLoadState] = useState<StoryVideoLoadState>("idle");
  const loadStateRef = useRef(loadState);
  const inViewRef = useRef(false);
  loadStateRef.current = loadState;

  const attachSource = shouldAttachStoryVideoSource(loadState);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const resume = () => {
      if (
        inViewRef.current &&
        video.paused &&
        shouldAttachStoryVideoSource(loadStateRef.current)
      ) {
        void video.play().catch(() => {});
      }
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        inViewRef.current = entry.isIntersecting;
        setLoadState((current) =>
          nextStoryVideoLoadState(current, entry.isIntersecting),
        );
        if (entry.isIntersecting) resume();
        else video.pause();
      },
      { threshold: 0.15, rootMargin: STORY_VIDEO_ROOT_MARGIN },
    );
    observer.observe(video);

    video.addEventListener("pause", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      observer.disconnect();
      video.removeEventListener("pause", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, []);

  // After the source is attached, kick the element so preload=none still
  // fetches and autoplay can start once near-viewport.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || loadState !== "pending") return;
    video.load();
    setLoadState("ready");
    if (inViewRef.current) void video.play().catch(() => {});
  }, [loadState, webm]);

  return (
    <video
      ref={videoRef}
      className="home-story-visual-video"
      muted
      loop
      playsInline
      preload={STORY_VIDEO_PRELOAD}
      poster={poster}
      aria-label={label}
    >
      {attachSource ? <source src={webm} type="video/webm" /> : null}
    </video>
  );
}

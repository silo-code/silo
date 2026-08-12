import { useEffect, useRef } from "react";

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
 */
export function StoryVideo({ webm, poster, label }: StoryVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let inView = false;
    const resume = () => {
      if (inView && video.paused) void video.play().catch(() => {});
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        inView = entry.isIntersecting;
        if (inView) resume();
        else video.pause();
      },
      { threshold: 0.25 },
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

  return (
    <video
      ref={videoRef}
      className="home-story-visual-video"
      muted
      loop
      playsInline
      preload="auto"
      poster={poster}
      aria-label={label}
    >
      <source src={webm} type="video/webm" />
    </video>
  );
}

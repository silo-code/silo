/**
 * A user prompt's bubble — the text, its attachment chips, and the
 * **Show more** / **Show less** toggle a long one earns.
 *
 * Its own component rather than markup inside `renderTranscriptEntry` because
 * collapsing is per-prompt state: each bubble remembers whether *it* is open,
 * and nothing above it in the transcript needs to know. That also keeps the
 * measurement local — the rest of the transcript renders without ever reading
 * layout.
 *
 * The rules for when to measure and what the measurement means live in
 * `prompt-collapse.ts`; this file is the DOM half.
 */

import { useLayoutEffect, useRef, useState } from "react";

import { LinkifiedText } from "./LinkifiedText";
import {
  promptIsClipped,
  promptMayOverflow,
  promptToggleLabel,
} from "./prompt-collapse";

export function PromptBubble({
  entryKey,
  text,
  attachments,
}: {
  /** The entry's key, so the chips can key off it the way they always have. */
  entryKey: string;
  text: string;
  attachments?: readonly string[];
}) {
  const [expanded, setExpanded] = useState(false);
  /** Whether the clip is hiding anything — the one thing that decides whether
   *  the toggle exists at all. Only ever measured while collapsed. */
  const [clipped, setClipped] = useState(false);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const clipRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);

  const candidate = promptMayOverflow(text, attachments?.length ?? 0);

  useLayoutEffect(() => {
    // Expanded, the clip is off: content and clip are the same height, so a
    // measurement would say "nothing hidden" and take the toggle away
    // mid-read. `clipped` stays as the collapsed pass left it until the user
    // closes the bubble again, which re-runs this.
    if (!candidate || expanded) return;
    const clip = clipRef.current;
    const content = contentRef.current;
    if (!clip || !content) return;

    const measure = () => {
      setClipped(
        promptIsClipped(
          content.getBoundingClientRect().height,
          clip.getBoundingClientRect().height,
        ),
      );
    };
    measure();
    // Both sides move independently: the clip when the dock is resized, the
    // content when that resize re-wraps the text. Observing the content alone
    // would miss a panel widened past the point where the prompt fits.
    const observer = new ResizeObserver(measure);
    observer.observe(clip);
    observer.observe(content);
    return () => observer.disconnect();
  }, [candidate, expanded, text]);

  // Collapsing a prompt the user scrolled down through deletes everything
  // between its top and the toggle they just clicked, landing them somewhere
  // else entirely. The correction has to happen *after* the collapse lays out,
  // hence a layout effect rather than the click handler: `"nearest"` is a
  // no-op when the now-short bubble is already fully in view, and the smallest
  // possible scroll when it isn't. Never fires on an expand — growing
  // downwards from a bubble the user is already looking at is what they asked
  // for.
  const recenterOnCollapse = useRef(false);
  useLayoutEffect(() => {
    if (expanded || !recenterOnCollapse.current) return;
    recenterOnCollapse.current = false;
    bubbleRef.current?.scrollIntoView({ block: "nearest" });
  }, [expanded]);

  const toggle = () => {
    recenterOnCollapse.current = expanded;
    setExpanded(!expanded);
  };

  return (
    <div ref={bubbleRef} className="acp-chat__message-bubble">
      <div
        ref={clipRef}
        className="acp-chat__message-clip"
        data-clip={candidate && !expanded ? "" : undefined}
        data-fade={clipped && !expanded ? "" : undefined}
      >
        {/* The measured box. Separate from the clip because its height has to
            stay the prompt's *natural* one — the clip's is capped by
            definition, so the two together are the comparison. */}
        <div ref={contentRef} className="acp-chat__message-content">
          <div className="acp-chat__text">
            <LinkifiedText text={text} />
          </div>
          {attachments && attachments.length > 0 ? (
            <div className="acp-chat__attachments">
              {attachments.map((name, i) => (
                <span key={`${entryKey}-att-${i}`} className="acp-chat__chip">
                  {name}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      </div>
      {clipped ? (
        <button
          type="button"
          className="acp-chat__message-expand"
          aria-expanded={expanded}
          onClick={toggle}
        >
          {promptToggleLabel(expanded)}
        </button>
      ) : null}
    </div>
  );
}

/**
 * Split a literal string into text and dashed-underline link spans.
 * Activation (⌘-click / context menu) is handled on the transcript scroller
 * via `data-acp-link` / `data-href` — this component only marks them up.
 */

import type { ReactNode } from "react";
import { matchChatLinks } from "./link-match";

export function LinkifiedText({ text }: { text: string }) {
  const spans = matchChatLinks(text);
  if (spans.length === 0) return <>{text}</>;
  const parts: ReactNode[] = [];
  let cursor = 0;
  spans.forEach((span, i) => {
    if (span.index > cursor) {
      parts.push(text.slice(cursor, span.index));
    }
    parts.push(
      <span
        key={`${span.index}-${i}`}
        className="acp-chat__link"
        data-acp-link={span.kind}
        data-href={span.text}
      >
        {span.text}
      </span>,
    );
    cursor = span.index + span.text.length;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}

/** The link under `target`, if the event landed on a marked-up span. */
export function chatLinkFromTarget(
  target: EventTarget | null,
): { kind: "url" | "path"; text: string } | undefined {
  if (!(target instanceof Element)) return undefined;
  const el = target.closest<HTMLElement>("[data-acp-link][data-href]");
  if (!el) return undefined;
  const kind = el.dataset.acpLink;
  const text = el.dataset.href;
  if ((kind !== "url" && kind !== "path") || !text) return undefined;
  return { kind, text };
}

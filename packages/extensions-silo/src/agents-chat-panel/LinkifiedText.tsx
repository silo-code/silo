/**
 * Split a literal string into text and dashed-underline link spans.
 * Activation (⌘-click / context menu) is handled on the transcript scroller
 * via `data-acp-link` / `data-href` — this component only marks them up.
 */

import type { ReactNode } from "react";
import { Tooltip } from "@silo-code/sdk";
import { matchChatLinks, type ChatLinkKind } from "./link-match";
import { linkMenuLabels, linkModifierLabel } from "./link-policy";

const IS_MAC =
  typeof navigator !== "undefined" &&
  navigator.platform.toUpperCase().includes("MAC");

/** One `data-acp-link` span with a tooltip naming the modifier that opens
 *  it — a plain click alone gives no hint that the row it's part of (a tool
 *  title, a message line) needs a held key to activate the link. */
export function ChatLinkSpan({
  kind,
  href,
  children,
}: {
  kind: ChatLinkKind;
  href: string;
  children: ReactNode;
}) {
  const { open } = linkMenuLabels(kind);
  return (
    <Tooltip
      content={`${linkModifierLabel(IS_MAC)}-click to ${open.toLowerCase()}`}
    >
      <span className="acp-chat__link" data-acp-link={kind} data-href={href}>
        {children}
      </span>
    </Tooltip>
  );
}

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
      <ChatLinkSpan
        key={`${span.index}-${i}`}
        kind={span.kind}
        href={span.text}
      >
        {span.text}
      </ChatLinkSpan>,
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

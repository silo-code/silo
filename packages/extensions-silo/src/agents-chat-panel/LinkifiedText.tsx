/**
 * Split a literal string into text and dashed-underline link spans.
 * Activation (⌘-click / context menu) is handled on the transcript scroller
 * via `data-acp-link` / `data-href` — this component only marks them up.
 *
 * A span that might continue past a space is **verified on hover** (RFC
 * 0066): the ladder of readings goes to {@link ChatLinkVerifyContext}, and a
 * longer reading that exists on disk replaces the heuristic one. Nothing is
 * verified while rendering — see `link-verify.ts` for why that line matters.
 */

import {
  createContext,
  memo,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Tooltip } from "@silo-code/sdk";
import {
  matchChatLinks,
  type ChatLinkKind,
  // The span *model*; `ChatLinkSpan` below is this file's component for one.
  type ChatLinkSpan as LinkSpan,
} from "./link-match";
import { pathCandidates } from "./link-candidates";
import { linkMenuLabels, linkModifierLabel } from "./link-policy";

const IS_MAC =
  typeof navigator !== "undefined" &&
  navigator.platform.toUpperCase().includes("MAC");

/** Verification for the transcript's links, supplied by the panel (which owns
 *  `ctx.files` and the session's working directory). Absent outside a panel — a
 *  prompt bubble in a test, say — in which case spans render heuristically,
 *  which is what they did before this existed. */
export const ChatLinkVerifyContext = createContext<
  ((line: string, span: LinkSpan) => Promise<string>) | undefined
>(undefined);

/**
 * The readings an already-rendered link span could have, for the activation
 * path — a ⌘-click that beat the hover probe still has to open the right file.
 *
 * A `WeakMap` rather than a `data-` attribute on purpose: a transcript holds
 * tens of thousands of nodes, and RFC 0050 makes every attribute on every span
 * a cost. Only ambiguous spans are registered at all.
 */
const ambiguousByElement = new WeakMap<
  Element,
  { line: string; span: LinkSpan }
>();

/** The ladder for the element a link event landed on, or `undefined` when the
 *  span was unambiguous. Built here rather than at render time: a ladder is
 *  strings, and a transcript renders far more spans than anyone ever clicks. */
export function chatLinkCandidates(
  target: Element | null,
): readonly string[] | undefined {
  if (!target) return undefined;
  const el = target.closest("[data-acp-link]");
  const entry = el ? ambiguousByElement.get(el) : undefined;
  return entry ? pathCandidates(entry.line, entry.span) : undefined;
}

/** Could this span continue past a space? One character lookup, because it
 *  runs for every span in the transcript (RFC 0050). A known path or a URL is
 *  exact by definition and never asks. */
function isAmbiguous(line: string, span: LinkSpan): boolean {
  return (
    span.kind === "path" &&
    span.href === span.text &&
    line[span.index + span.text.length] === " "
  );
}

/** One `data-acp-link` span with a tooltip naming the modifier that opens
 *  it — a plain click alone gives no hint that the row it's part of (a tool
 *  title, a message line) needs a held key to activate the link. */
export function ChatLinkSpan({
  kind,
  href,
  ambiguous,
  onHover,
  children,
}: {
  kind: ChatLinkKind;
  href: string;
  /** The span and its line, when the span might continue past a space — what
   *  the activation path needs to build a ladder. Omitted when it is exact. */
  ambiguous?: { line: string; span: LinkSpan };
  onHover?: () => void;
  children: ReactNode;
}) {
  const { open } = linkMenuLabels(kind);
  const ref = useCallback(
    (el: HTMLSpanElement | null) => {
      if (el && ambiguous) ambiguousByElement.set(el, ambiguous);
    },
    [ambiguous],
  );
  return (
    <Tooltip
      content={`${linkModifierLabel(IS_MAC)}-click to ${open.toLowerCase()}`}
    >
      <span
        ref={ref}
        className="acp-chat__link"
        data-acp-link={kind}
        data-href={href}
        onPointerEnter={onHover}
      >
        {children}
      </span>
    </Tooltip>
  );
}

const EMPTY_VERIFIED: ReadonlyMap<number, string> = new Map();

/** Replace a span with its verified reading, dropping whatever the longer
 *  span now covers — the bogus second link a cut-short path left behind. */
function applyVerified(
  spans: readonly LinkSpan[],
  verified: ReadonlyMap<number, string>,
): LinkSpan[] {
  if (verified.size === 0) return [...spans];
  const out: LinkSpan[] = [];
  let coveredTo = 0;
  for (const span of spans) {
    if (span.index < coveredTo) continue;
    const longer = verified.get(span.index);
    const next =
      longer && longer.length > span.text.length
        ? { ...span, text: longer, href: longer }
        : span;
    out.push(next);
    coveredTo = next.index + next.text.length;
  }
  return out;
}

/** Memoized on `text`, its whole input — the same reason
 *  {@link TranscriptMarkdown} is. This is what renders a user message and
 *  every tool row's Input/Output well, so it runs its link regex over the
 *  transcript as many times as the panel re-renders otherwise. */
export const LinkifiedText = memo(function LinkifiedText({
  text,
  knownPaths,
}: {
  text: string;
  /** Paths the caller knows this text is about (a tool call's `locations`).
   *  Must be a stable array — see `tool-known-paths.ts`. */
  knownPaths?: readonly string[];
}) {
  const verify = useContext(ChatLinkVerifyContext);
  // Tagged with the text it was resolved against: a tool row relabels itself
  // mid-call, and a reading keyed by offset into the *old* label would land
  // somewhere arbitrary in the new one.
  const [verified, setVerified] = useState<{
    forText: string;
    spans: ReadonlyMap<number, string>;
  }>(() => ({ forText: text, spans: new Map() }));
  const spans = useMemo(
    () =>
      applyVerified(
        matchChatLinks(text, knownPaths),
        verified.forText === text ? verified.spans : EMPTY_VERIFIED,
      ),
    [text, knownPaths, verified],
  );
  const onHover = useCallback(
    (span: LinkSpan) => {
      if (!verify) return;
      void verify(text, span).then((result) => {
        if (result === span.text) return;
        setVerified((prev) => {
          const base = prev.forText === text ? prev.spans : EMPTY_VERIFIED;
          if (base.get(span.index) === result) return prev;
          return {
            forText: text,
            spans: new Map(base).set(span.index, result),
          };
        });
      });
    },
    [verify, text],
  );

  if (spans.length === 0) return <>{text}</>;
  const parts: ReactNode[] = [];
  let cursor = 0;
  spans.forEach((span, i) => {
    if (span.index > cursor) {
      parts.push(text.slice(cursor, span.index));
    }
    // A known path (exact, from the protocol) is never ambiguous, and neither
    // is a URL — neither one costs a ladder or a probe.
    const ambiguous = isAmbiguous(text, span)
      ? { line: text, span }
      : undefined;
    parts.push(
      <ChatLinkSpan
        key={`${span.index}-${i}`}
        kind={span.kind}
        href={span.href}
        {...(ambiguous ? { ambiguous, onHover: () => onHover(span) } : {})}
      >
        {span.text}
      </ChatLinkSpan>,
    );
    cursor = span.index + span.text.length;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
});

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

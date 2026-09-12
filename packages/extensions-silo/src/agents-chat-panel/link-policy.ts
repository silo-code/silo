/**
 * How a chat-panel link is activated — the same rules as the terminal
 * (ADR 0027): Cmd/Ctrl+click opens, a plain click is a no-op so the user
 * can still select the text. Copied from
 * `packages/extensions-core/src/terminal/terminal-link-policy.ts` because
 * silo.* cannot import that package.
 */

import type { ChatLinkKind } from "./link-match";

export function linkModifierLabel(isMac: boolean): string {
  return isMac ? "⌘" : "Ctrl";
}

export function isLinkActivationClick(
  event: Pick<MouseEvent, "metaKey" | "ctrlKey">,
  isMac: boolean,
): boolean {
  return isMac ? event.metaKey : event.ctrlKey;
}

export function linkMenuLabels(kind: ChatLinkKind): {
  open: string;
  copy: string;
} {
  return kind === "url"
    ? { open: "Open Link", copy: "Copy Link" }
    : { open: "Open File", copy: "Copy Path" };
}

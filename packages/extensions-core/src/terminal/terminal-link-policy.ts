// Single source of truth for how a link behaves in the terminal, shared by
// every link mechanism in play: xterm's native OSC-8 hyperlink handler (what
// Claude Code and other TUIs emit), the WebLinksAddon (bare URLs typed as
// plain text), and Silo's own file-path link provider (terminal-links.ts).
// See ADR 0027 — keeping the modifier/tooltip/menu rules in one place is what
// stops the three providers from drifting into inconsistent behavior, which
// is what caused links to stop opening in the first place.
export type TerminalLinkKind = "url" | "path";

export interface TerminalLinkRange {
  start: { x: number; y: number };
  end: { x: number; y: number };
}

export interface HoveredTerminalLink {
  kind: TerminalLinkKind;
  text: string;
  range: TerminalLinkRange;
}

/** Display label for the terminal link-activation modifier on this platform. */
export function linkModifierLabel(isMac: boolean): string {
  return isMac ? "⌘" : "Ctrl";
}

/** True if `event` carries the platform's link-activation modifier — Cmd on macOS, Ctrl elsewhere. */
export function isLinkActivationClick(
  event: Pick<MouseEvent, "metaKey" | "ctrlKey">,
  isMac: boolean,
): boolean {
  return isMac ? event.metaKey : event.ctrlKey;
}

/** Hover-tooltip text for a link of the given kind, e.g. "Open link (⌘ + click)". */
export function linkTooltipText(
  kind: TerminalLinkKind,
  isMac: boolean,
): string {
  const action = kind === "url" ? "Open link" : "Open file";
  return `${action} (${linkModifierLabel(isMac)} + click)`;
}

/** Context-menu action labels for a link of the given kind. */
export function linkMenuLabels(kind: TerminalLinkKind): {
  open: string;
  copy: string;
} {
  return kind === "url"
    ? { open: "Open Link", copy: "Copy Link" }
    : { open: "Open File", copy: "Copy Path" };
}

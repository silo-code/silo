import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  baseWorkspaces,
  isDemoScriptClickStep,
  REGISTRY_CATEGORIES,
  REGISTRY_ENTRIES,
  SETTINGS_PAGES,
  type AgentMeta,
  type ChangeItem,
  type DemoScriptStep,
  type DockConfig,
  type DockTab,
  type GithubActionsConfig,
  type IssueItem,
  type IssueState,
  type PrChecksState,
  type PrItem,
  type PrReviewState,
  type MemorySegment,
  type Side,
  type SidePanel,
  type Status,
  type TerminalEntry,
  type TerminalLog,
  type Workspace,
} from "./demo-config";
import { heroScene, sceneScript, type DemoScene } from "./demo-scenes";
import { planScriptSeek, SCRIPT_CURSOR_TOP_Y_PCT } from "./demo-script-timing";
import { highlightLine, isHighlightable } from "./highlight";
import { parseRichText } from "./rich-text";
import {
  revealedTerminalAt,
  TERMINAL_DEFAULT_DELAY_MS,
} from "./terminal-playback";

const LOOP_PAUSE_MS = 3000;
const TERMINAL_LOOP_PAUSE_MS = 1600;
// How much of a finished round's scrollback survives into the next loop.
// Every terminal pane only ever shows its last handful of lines anyway (fixed
// pane height, overflow-y scroll), so anything beyond this is pure memory/DOM
// growth with no visible benefit — and left uncapped, a tab open for a while
// accumulates every round of every open terminal forever.
const TERMINAL_MAX_RETAINED_ENTRIES = 40;

function seededDelay(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++)
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return (hash % 140) / 100;
}

/** `seed` (e.g. a tab id) gives this dot's pulse animation a stable negative delay, so a row of several working/ready dots desyncs instead of pulsing in unison — omit it for a lone dot, where sync doesn't matter. */
function StatusDot({
  status,
  seed,
  className,
}: {
  status: Status;
  seed?: string;
  className?: string;
}) {
  const style = seed ? { animationDelay: `-${seededDelay(seed)}s` } : undefined;
  return (
    <span
      className={`status-dot status-${status}${className ? ` ${className}` : ""}`}
      style={style}
      aria-label={status}
    />
  );
}

/**
 * A "ready" tab you're already looking at doesn't need to ask for your
 * attention — its indicator (wherever it's shown: the tab's own dot, its
 * Navigator row, its Agents-view row) reads as neutral/none instead of the
 * usual green glow, the same muted look a long-idle Agents row already uses.
 * This is a display-only read of `status`/`focused` — it never touches the
 * underlying reveal simulation, so the agent's own output cadence is
 * unaffected regardless of whether anyone's looking at it.
 */
function isSeenReady(status: Status, focused: boolean): boolean {
  return focused && status === "ready";
}

/**
 * Turns a config-authored percentage into a fixed flex basis. Returning
 * `undefined` leaves the pane on its CSS default, so a workspace only has to
 * declare a size when it wants to depart from it.
 */
function paneFlex(size: number | undefined): { flex: string } | undefined {
  return size === undefined ? undefined : { flex: `0 0 ${size}%` };
}

function TrashIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="12"
      height="12"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="13"
      height="13"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

/**
 * Mirrors the real app's theme-picker swatch: content-tab bg, hover bg,
 * text, and accent, in that order.
 */
function ThemeSwatch() {
  const colors = ["#0f1115", "#1c2030", "#5a5959", "#a0a0a0"];
  return (
    <span className="theme-swatch" aria-hidden="true">
      {colors.map((color) => (
        <span key={color} style={{ background: color }} />
      ))}
    </span>
  );
}

/**
 * The status bar's layout toggles, mirroring the real app's: an outlined
 * window with its side region filled while that panel is open and reduced to
 * a bare divider once it's collapsed, so the icon itself reports the state.
 */
function PanelToggleIcon({ side, open }: { side: Side; open: boolean }) {
  const x = side === "left" ? 2.6 : 9.4;
  const dividerX = side === "left" ? 6 : 10;
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <rect
        x="2"
        y="3"
        width="12"
        height="10"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
      {open ? (
        <rect x={x} y="3.6" width="4" height="8.8" fill="currentColor" />
      ) : (
        <line
          x1={dividerX}
          y1="3"
          x2={dividerX}
          y2="13"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      )}
    </svg>
  );
}

// The real Claude Code brand mark (simple-icons, CC0-1.0) — same source
// agent-monitor's agent-icons.ts uses for the Agents panel's icon column.
function ClaudeIcon({ size = 10 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="#d97757"
      aria-hidden="true"
    >
      <path d="M21 10.5h3v3h-3v3h-1.5v3H18v-3h-1.5v3H15v-3H9v3H7.5v-3H6v3H4.5v-3H3v-3H0v-3h3v-6h18Zm-15 0h1.5v-3H6Zm10.5 0H18v-3h-1.5z" />
    </svg>
  );
}

// The real Cursor brand mark (simple-icons, CC0-1.0). Rendered in a light
// neutral rather than their canonical black, which would vanish against the
// dark navy chrome everything else here sits on.
function CursorIcon({ size = 10 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="#e3e6f0"
      aria-hidden="true"
    >
      <path d="M11.503.131 1.891 5.678a.84.84 0 0 0-.42.726v11.188c0 .3.162.575.42.724l9.609 5.55a1 1 0 0 0 .998 0l9.61-5.55a.84.84 0 0 0 .42-.724V6.404a.84.84 0 0 0-.42-.726L12.497.131a1.01 1.01 0 0 0-.996 0M2.657 6.338h18.55c.263 0 .43.287.297.515L12.23 22.918c-.062.107-.229.064-.229-.06V12.335a.59.59 0 0 0-.295-.51l-9.11-5.257c-.109-.063-.064-.23.061-.23" />
    </svg>
  );
}

/** Codex CLI mark — light fill so it reads on dark dock chrome. */
function CodexIcon({ size = 10 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="#e3e6f0"
      aria-hidden="true"
    >
      <path d="M12 1.5 3.5 6.4v11.2L12 22.5l8.5-4.9V6.4L12 1.5zm0 2.2 6.4 3.7v7.2L12 18.3l-6.4-3.7V7.4L12 3.7z" />
      <circle cx="12" cy="12" r="2.4" />
    </svg>
  );
}

/** Picks the right brand mark for a terminal's `agentId` — the one thing that differs across coding-agent CLIs here, everything else (banner/chrome layout) is already agent-agnostic. */
function AgentBrandIcon({ agentId, size }: { agentId: string; size?: number }) {
  if (agentId === "cursor") return <CursorIcon size={size} />;
  if (agentId === "codex") return <CodexIcon size={size} />;
  return <ClaudeIcon size={size} />;
}

function WarningIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="10"
      height="10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 1.8 14.6 13.4a.9.9 0 0 1-.78 1.35H2.18a.9.9 0 0 1-.78-1.35L8 1.8Z" />
      <line x1="8" y1="6" x2="8" y2="9.2" />
      <line x1="8" y1="11.4" x2="8" y2="11.5" strokeWidth="1.8" />
    </svg>
  );
}

/**
 * The github-prs panel's row icons. The real extension pulls these from
 * Phosphor; this prototype has no icon dependency, so they're traced by hand at
 * the same weights (filled circles for the resolved states, outlines for the
 * pull-request and merge glyphs). The knockout color is the side column's
 * background, which is what makes a filled circle read as a solid badge.
 */
const PANEL_BG = "#161922";

function CheckCircleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path
        d="m8 12.3 2.6 2.6L16 9.4"
        fill="none"
        stroke={PANEL_BG}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function XCircleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path
        d="m9 9 6 6m0-6-6 6"
        fill="none"
        stroke={PANEL_BG}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** The outline (Phosphor "regular" weight) ✗ the issues panel uses for closed-as-not-planned, where the PRs panel uses the filled one. */
function XCircleOutlineIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9.5" />
      <path d="m9 9 6 6m0-6-6 6" />
    </svg>
  );
}

/** A plain filled dot — the issues panel's "open" state icon. */
function CircleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="9" fill="currentColor" />
    </svg>
  );
}

function ClockCountdownIcon({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path
        d="M12 6.8V12l3.4 2"
        fill="none"
        stroke={PANEL_BG}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PullRequestIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6.5" cy="5.5" r="2.5" />
      <circle cx="6.5" cy="18.5" r="2.5" />
      <line x1="6.5" y1="8" x2="6.5" y2="16" />
      <circle cx="17.5" cy="18.5" r="2.5" />
      <path d="M17.5 16V9a3 3 0 0 0-3-3h-2.5" />
      <polyline points="14 3.5 11.5 6 14 8.5" />
    </svg>
  );
}

function GitMergeIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6.5" cy="5.5" r="2.5" />
      <circle cx="6.5" cy="18.5" r="2.5" />
      <circle cx="17.5" cy="12" r="2.5" />
      <line x1="6.5" y1="8" x2="6.5" y2="16" />
      <path d="M9 6.2h2.5a3.5 3.5 0 0 1 3.5 3.5v1.1" />
    </svg>
  );
}

/** The pending-checks spinner — an open arc, spun by `.ghpr-pulse` exactly as the real panel spins Phosphor's CircleNotch. */
function CircleNotchIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden="true"
      className="ghpr-pulse"
    >
      <path d="M12 2.8a9.2 9.2 0 1 0 9.2 9.2" />
    </svg>
  );
}

function CaretDownIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3.5 6 8 10.5 12.5 6" />
    </svg>
  );
}

/** Phosphor's TreeStructure — the git panel's worktree-manager button. */
function TreeStructureIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="8.5" y="2.5" width="7" height="5.5" rx="1" />
      <rect x="2" y="16" width="6.5" height="5.5" rx="1" />
      <rect x="15.5" y="16" width="6.5" height="5.5" rx="1" />
      <path d="M12 8v4M5.25 16v-4h13.5v4" />
    </svg>
  );
}

/** Phosphor's DotsThreeVertical (bold) — the git panel's "More actions" button. */
function DotsVerticalIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="currentColor"
      aria-hidden="true"
    >
      <circle cx="12" cy="6" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="18" r="1.6" />
    </svg>
  );
}

/** The git panel's `ICON_CHECK`, traced from `git-icons.tsx`. */
function CheckIcon({ size = 15 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8.5l3 3 7-7" />
    </svg>
  );
}

/** The magnifier inside the SDK's SearchInput. */
function SearchGlyphIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.4 10.4 14 14" />
    </svg>
  );
}

/** The collapsed-row chevron in the System panel's Processes card. */
function ChevronRightIcon({ size = 11 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 3l5 5-5 5" />
    </svg>
  );
}

/** The git panel's `ICON_CHEV_DOWN`, traced from `git-icons.tsx`. */
function ChevronDownIcon({ size = 11 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6l5 5 5-5" />
    </svg>
  );
}

/** Phosphor's File (regular) — the leading glyph on every git file row. */
function FileGlyphIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M14 3H6.5A1.5 1.5 0 0 0 5 4.5v15A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V8z" />
      <polyline points="14 3 14 8 19 8" />
    </svg>
  );
}

function RefreshIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="21 4 21 9.5 15.5 9.5" />
      <polyline points="3 20 3 14.5 8.5 14.5" />
      <path d="M5.2 9a7.6 7.6 0 0 1 12.5-2.8L21 9.5" />
      <path d="M3 14.5l3.3 3.3A7.6 7.6 0 0 0 18.8 15" />
    </svg>
  );
}

/** The status bar's GitHub Actions indicator and the modal's FAILED line — a 3-node workflow graph, distinct from `GitMergeIcon`'s branch glyph. */
function WorkflowIcon({ size = 13 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="6" cy="6" r="2.3" />
      <circle cx="6" cy="18" r="2.3" />
      <circle cx="18" cy="12" r="2.3" />
      <path d="M8 7.3 16 10.8M8 16.7 16 13.2" />
    </svg>
  );
}

/** GitHub's book-shaped repo mark, traced for the Actions modal's repo line. */
function RepoIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M6 3.5h11a1.5 1.5 0 0 1 1.5 1.5v14.5H7.5A1.5 1.5 0 0 1 6 18V3.5Z" />
      <path d="M6 17h12" />
      <path d="M9 3.5v6l2-1.3 2 1.3v-6" />
    </svg>
  );
}

function CopyIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="8.5" y="8.5" width="11" height="11" rx="1.5" />
      <path d="M5.5 15.5h-1A1.5 1.5 0 0 1 3 14V5.5A1.5 1.5 0 0 1 4.5 4H13a1.5 1.5 0 0 1 1.5 1.5v1" />
    </svg>
  );
}

function ExternalLinkIcon({ size = 12 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 6H5.5A1.5 1.5 0 0 0 4 7.5v11A1.5 1.5 0 0 0 5.5 20h11a1.5 1.5 0 0 0 1.5-1.5V15" />
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
    </svg>
  );
}

/** Renders scripted terminal text with inline `**bold**` / `` `code` `` / file-ref markup — see `rich-text.ts`. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {parseRichText(text).map((token, index) =>
        token.className ? (
          <span key={index} className={token.className}>
            {token.text}
          </span>
        ) : (
          token.text
        ),
      )}
    </>
  );
}

/** `since` is when this tab's current `status` began (a real status change, not every entry reveal) — the Agents view's elapsed time is `Date.now() - since`. */
type TerminalTabState = {
  entries: TerminalEntry[];
  status: Status;
  since: number;
};

/** Which Navigator view is showing — the classic workspace list, or the agent-monitor-style flat agent list, switched via the panel's "Workspaces⌄"/"Agents⌄" dropdown. */
type NavigatorView = "workspaces" | "agents";

/**
 * Terminal reveal state for every open workspace.
 *
 * - Homepage (`clockMs == null`): independent setTimeout loops, as before.
 * - Vignette recorder (`clockMs` set): entries are derived from the playhead
 *   so Play / Pause / scrub stay locked to the Claude transcript. At t=0 the
 *   pane is idle (banner only) until the playhead advances.
 *
 * `visibleTabKeys` / `origins` let a vignette hide a tab until a script beat
 * (Codex) and start that tab's clock from the reveal time rather than t=0.
 */
function useLiveTerminalStates(
  catalog: Workspace[],
  openWorkspaceIds: string[],
  clockMs: number | null = null,
  visibleTabKeys: string[] | null = null,
  origins: Record<string, number> = {},
): Record<string, TerminalTabState> {
  const [states, setStates] = useState<Record<string, TerminalTabState>>({});
  const openKey = openWorkspaceIds.join(",");
  const visibleKey = visibleTabKeys?.join(",") ?? "*";
  const originsKey = JSON.stringify(origins);

  const clockDriven = useMemo(() => {
    if (clockMs == null) return null;
    const now = Date.now();
    const next: Record<string, TerminalTabState> = {};
    for (const workspace of catalog) {
      if (!openWorkspaceIds.includes(workspace.id)) continue;
      for (const terminalDock of workspace.docks.filter(
        (d) => d.kind === "terminal",
      )) {
        for (const tab of terminalDock.tabs ?? []) {
          const key = `${workspace.id}:${tab.id}`;
          if (visibleTabKeys && !visibleTabKeys.includes(key)) continue;
          const origin = origins[key] ?? 0;
          const reveal = revealedTerminalAt(tab.log, clockMs - origin);
          next[key] = {
            entries: reveal.entries,
            status: reveal.status,
            since: now,
          };
        }
      }
    }
    return next;
  }, [
    catalog,
    clockMs,
    openKey,
    openWorkspaceIds,
    visibleKey,
    originsKey,
    visibleTabKeys,
    origins,
  ]);

  useEffect(() => {
    if (clockMs != null) return;

    const liveTabs: { key: string; tab: DockTab }[] = [];
    for (const workspace of catalog) {
      if (!openWorkspaceIds.includes(workspace.id)) continue;
      for (const terminalDock of workspace.docks.filter(
        (d) => d.kind === "terminal",
      )) {
        for (const tab of terminalDock.tabs ?? []) {
          const key = `${workspace.id}:${tab.id}`;
          if (visibleTabKeys && !visibleTabKeys.includes(key)) continue;
          liveTabs.push({ key, tab });
        }
      }
    }
    if (liveTabs.length === 0) {
      setStates({});
      return;
    }
    const now = Date.now();
    setStates(
      Object.fromEntries(
        liveTabs.map(({ key }) => [
          key,
          { entries: [], status: "working" as Status, since: now },
        ]),
      ),
    );

    const timers: number[] = [];
    for (const { key, tab } of liveTabs) {
      const total = tab.log.entries.length;
      if (total === 0) continue;
      const loopPause = tab.log.loopPauseMs ?? TERMINAL_LOOP_PAUSE_MS;
      const revealFrom = (index: number, before: TerminalEntry[]) => {
        const delay =
          tab.log.entries[index].delayMs ?? TERMINAL_DEFAULT_DELAY_MS;
        timers.push(
          window.setTimeout(() => {
            const revealed = [...before, tab.log.entries[index]];
            const done = index + 1 >= total;
            const status: Status = done ? "ready" : "working";
            setStates((current) => {
              const prev = current[key];
              const since =
                prev && prev.status === status ? prev.since : Date.now();
              return {
                ...current,
                [key]: { entries: revealed, status, since },
              };
            });
            if (!done) {
              revealFrom(index + 1, revealed);
            } else if (tab.log.loop !== false) {
              const retained = revealed.slice(-TERMINAL_MAX_RETAINED_ENTRIES);
              timers.push(
                window.setTimeout(() => revealFrom(0, retained), loopPause),
              );
            }
          }, delay),
        );
      };
      revealFrom(0, []);
    }
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [catalog, openKey, clockMs, openWorkspaceIds, visibleKey, visibleTabKeys]);

  return clockDriven ?? states;
}

/**
 * The system-monitor extension's own palette (`collectors/palette.ts`) and CPU
 * series colors — literal hexes there too, not theme tokens, so they carry over
 * verbatim and the cards read exactly as they do in the app.
 */
const MEM_COLORS: Record<string, string> = {
  app: "#e3b341",
  used: "#e3b341",
  wired: "#f47067",
  cache: "#4493f8",
  free: "#3fb950",
};
const CPU_USER_COLOR = "#4493f8";
const CPU_SYS_COLOR = "#f47067";

/** `formatBytes` from the extension's `metrics.ts`. */
function formatBytes(bytes: number): string {
  const gib = 1024 ** 3;
  const mib = 1024 ** 2;
  if (bytes >= gib) return `${(bytes / gib).toFixed(1)} GB`;
  if (bytes >= mib) return `${Math.round(bytes / mib)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

/** `formatCpu` / `formatMem` from the extension's `processes/model.ts`. */
function formatCpu(pct: number): string {
  return `${Math.round(pct)}%`;
}

function formatMem(mb: number): string {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`;
}

/** The extension's `cpuClass`/`memClass` thresholds — warn at 25% / 500MB, danger at 75% / 2GB. */
function procStatClass(value: number, warn: number, danger: number): string {
  if (value >= danger) return "sm-proc-stat sm-proc-stat-danger";
  if (value >= warn) return "sm-proc-stat sm-proc-stat-warn";
  return "sm-proc-stat";
}

const SM_BAR_W = 3;
const SM_GAP = 1;

/**
 * A deterministic CPU history for the chart. The real panel plots samples
 * collected over time; a static prototype has none, so this synthesizes a stable
 * series from the workspace id — same shape every render, different per workspace.
 */
function cpuHistory(
  seed: string,
  count: number,
  user: number,
  sys: number,
): { user: number; sys: number }[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++)
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  const next = () => {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    return hash / 0xffffffff;
  };
  return Array.from({ length: count }, () => ({
    user: Math.max(2, Math.min(88, user * (0.45 + next() * 1.15))),
    sys: Math.max(1, Math.min(40, sys * (0.35 + next() * 1.5))),
  }));
}

/** The extension's `CpuBarChart`: stacked user/system bars over 25/50/75% gridlines. */
function CpuBarChart({
  data,
  width,
  height,
}: {
  data: { user: number; sys: number }[];
  width: number;
  height: number;
}) {
  const step = SM_BAR_W + SM_GAP;
  const capacity = Math.max(Math.floor(width / step), 2);
  const svgWidth = capacity * step;
  const visible = data.slice(-capacity);
  return (
    <svg
      width={svgWidth}
      height={height}
      style={{ display: "block" }}
      aria-hidden="true"
    >
      {[25, 50, 75].map((pct) => (
        <line
          key={pct}
          x1={0}
          y1={height * (1 - pct / 100)}
          x2={svgWidth}
          y2={height * (1 - pct / 100)}
          stroke="#2b3148"
          strokeWidth={0.5}
        />
      ))}
      {visible.map((sample, index) => {
        const userH = Math.round((sample.user / 100) * height);
        const sysH = Math.round((sample.sys / 100) * height);
        const x = index * step;
        return (
          <g key={index}>
            {userH > 0 && (
              <rect
                x={x}
                y={height - userH}
                width={SM_BAR_W}
                height={userH}
                fill={CPU_USER_COLOR}
                fillOpacity={0.88}
              />
            )}
            {sysH > 0 && (
              <rect
                x={x}
                y={height - userH - sysH}
                width={SM_BAR_W}
                height={sysH}
                fill={CPU_SYS_COLOR}
                fillOpacity={0.88}
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Measures the chart well and fills it, the way the real panel does with its `useSize` hook — the bar count follows the panel's width instead of a fixed guess. */
function CpuChart({
  seed,
  user,
  sys,
}: {
  seed: string;
  user: number;
  sys: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const observer = new ResizeObserver(([entry]) => {
      setSize({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);
  const history = useMemo(
    () => cpuHistory(seed, 240, user, sys),
    [seed, user, sys],
  );
  return (
    <div className="sm-chart-wrap" ref={wrapRef}>
      {size.width > 0 && (
        <CpuBarChart data={history} width={size.width} height={size.height} />
      )}
    </div>
  );
}

/** The extension's `DonutRing`: segments laid end to end around a track, with a value in the hole. */
function MemoryDonut({
  segments,
  total,
  size = 92,
}: {
  segments: MemorySegment[];
  total: number;
  size?: number;
}) {
  const stroke = Math.round(size / 7);
  const radius = (size - stroke) / 2;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  let cumulative = 0;
  return (
    <svg
      width={size}
      height={size}
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="#2b3148"
        strokeWidth={stroke}
      />
      {segments.map((segment) => {
        const pct = (segment.gb / total) * 100;
        const dash = (pct / 100) * circumference;
        const angle = (cumulative / 100) * 360 - 90;
        cumulative += pct;
        if (pct < 0.3) return null;
        return (
          <circle
            key={segment.label}
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={MEM_COLORS[segment.label.toLowerCase()] ?? "#6d7593"}
            strokeWidth={stroke}
            strokeDasharray={`${dash} ${circumference - dash}`}
            transform={`rotate(${angle}, ${center}, ${center})`}
          />
        );
      })}
    </svg>
  );
}

/** Chars of context kept before the first match when trimming a long line — the file-search panel's `MATCH_LEAD_CONTEXT`. */
const MATCH_LEAD_CONTEXT = 8;

/** Every occurrence of `query` in `line`, as `[start, end)` offsets. The prototype derives ranges the way a real search would rather than hand-authoring them in JSON. */
function matchRanges(
  line: string,
  query: string,
  caseSensitive: boolean,
): [number, number][] {
  if (query === "") return [];
  const haystack = caseSensitive ? line : line.toLowerCase();
  const needle = caseSensitive ? query : query.toLowerCase();
  const ranges: [number, number][] = [];
  for (
    let at = haystack.indexOf(needle);
    at !== -1;
    at = haystack.indexOf(needle, at + needle.length)
  ) {
    ranges.push([at, at + needle.length]);
  }
  return ranges;
}

/**
 * Trim the start of a preview when the first match sits far into a long line, so
 * the highlight stays visible in a narrow panel. Keeps `MATCH_LEAD_CONTEXT` chars
 * before it, prepends an ellipsis, and shifts the ranges — the file-search
 * panel's `clampPreviewStart`.
 */
function clampPreviewStart(
  preview: string,
  ranges: [number, number][],
): { preview: string; ranges: [number, number][] } {
  if (ranges.length === 0) return { preview, ranges };
  const firstStart = Math.min(...ranges.map(([start]) => start));
  if (firstStart <= MATCH_LEAD_CONTEXT) return { preview, ranges };
  const ellipsis = "…";
  const shift = ellipsis.length - (firstStart - MATCH_LEAD_CONTEXT);
  return {
    preview: ellipsis + preview.slice(firstStart - MATCH_LEAD_CONTEXT),
    ranges: ranges
      .map(([start, end]): [number, number] => [start + shift, end + shift])
      .filter(([, end]) => end > ellipsis.length)
      .map(([start, end]): [number, number] => [
        Math.max(ellipsis.length, start),
        end,
      ]),
  };
}

/** Splits a preview into plain and highlighted runs, coalescing adjacent runs — the file-search panel's `highlightSegments`. */
function highlightSegments(
  preview: string,
  ranges: [number, number][],
): { text: string; match: boolean }[] {
  const valid = ranges
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  if (valid.length === 0) return [{ text: preview, match: false }];
  const segments: { text: string; match: boolean }[] = [];
  const push = (text: string, match: boolean) => {
    if (text === "") return;
    const last = segments[segments.length - 1];
    if (last && last.match === match) last.text += text;
    else segments.push({ text, match });
  };
  let cursor = 0;
  for (const [start, end] of valid) {
    const from = Math.max(cursor, Math.min(start, preview.length));
    const to = Math.max(from, Math.min(end, preview.length));
    push(preview.slice(cursor, from), false);
    push(preview.slice(from, to), true);
    cursor = to;
  }
  push(preview.slice(cursor), false);
  return segments;
}

/** `"45 results in 10 files"` — the file-search panel's `summarize`. */
function summarizeSearch(totalMatches: number, fileCount: number): string {
  if (totalMatches === 0) return "No results";
  const results = totalMatches === 1 ? "1 result" : `${totalMatches} results`;
  const files = fileCount === 1 ? "1 file" : `${fileCount} files`;
  return `${results} in ${files}`;
}

function SearchMatchRow({
  line,
  query,
  caseSensitive,
}: {
  line: string;
  query: string;
  caseSensitive: boolean;
}) {
  const clamped = clampPreviewStart(
    line,
    matchRanges(line, query, caseSensitive),
  );
  return (
    <div className="fsearch-match">
      <span className="fsearch-match-text">
        {highlightSegments(clamped.preview, clamped.ranges).map(
          (segment, index) =>
            segment.match ? (
              <mark key={index} className="fsearch-hit">
                {segment.text}
              </mark>
            ) : (
              <span key={index}>{segment.text}</span>
            ),
        )}
      </span>
    </div>
  );
}

/** `"src/App.tsx"` → bold `App.tsx` + dim `src`; a root-level file has no dir. Mirrors the git panel's `splitNameAndDir`. */
function splitNameAndDir(path: string): { name: string; dir: string } {
  const index = path.lastIndexOf("/");
  return index === -1
    ? { name: path, dir: "" }
    : { name: path.slice(index + 1), dir: path.slice(0, index) };
}

function GitFileRow({ change }: { change: ChangeItem }) {
  const { name, dir } = splitNameAndDir(change.path);
  return (
    <div className="git-file-row">
      <span className="git-file-ico">
        <FileGlyphIcon />
      </span>
      <span className="git-file-name">{name}</span>
      {/* Only the dir carries `flex: 1`, so a root-level file's status glyph sits
          right after its name instead of being pushed to the row's far edge —
          the same asymmetry the real panel has. */}
      {dir && <span className="git-file-dir">{dir}</span>}
      <span className={`git-status-glyph git-status-${change.status}`}>
        {change.status}
      </span>
    </div>
  );
}

function GitSection({
  title,
  changes,
}: {
  title: string;
  changes: ChangeItem[];
}) {
  return (
    <div className="git-section">
      <div className="git-section-head">
        <span className="git-section-chev">
          <ChevronDownIcon />
        </span>
        <span className="git-section-title">{title}</span>
        <span className="git-section-count">{changes.length}</span>
      </div>
      <div className="git-section-body">
        {changes.length === 0 ? (
          <div className="git-section-empty">No changes.</div>
        ) : (
          changes.map((change) => (
            <GitFileRow key={change.path} change={change} />
          ))
        )}
      </div>
    </div>
  );
}

/** Leading icon + color for a PR's review state — the prototype's stand-in for the real panel's `reviewIcon`. */
function PrReviewIcon({ state }: { state: PrReviewState }) {
  if (state === "approved")
    return (
      <span className="ghpr-row-icon gh-ok">
        <CheckCircleIcon />
      </span>
    );
  if (state === "changes-requested")
    return (
      <span className="ghpr-row-icon gh-err">
        <XCircleIcon />
      </span>
    );
  if (state === "review-required")
    return (
      <span className="ghpr-row-icon gh-warn">
        <ClockCountdownIcon />
      </span>
    );
  if (state === "merged")
    return (
      <span className="ghpr-row-icon gh-accent">
        <GitMergeIcon />
      </span>
    );
  if (state === "draft")
    return (
      <span className="ghpr-row-icon gh-muted">
        <PullRequestIcon />
      </span>
    );
  return (
    <span className="ghpr-row-icon gh-accent">
      <PullRequestIcon />
    </span>
  );
}

/**
 * Trailing CI indicator. The failing count is printed only when more than one
 * check failed — a lone failure is just the ✗, same as the real panel.
 */
function PrChecksTrail({
  checks,
  failing,
}: {
  checks?: PrChecksState;
  failing?: number;
}) {
  if (checks === "failing") {
    return (
      <span className="ghpr-row-trail gh-err">
        <XCircleIcon size={14} />
        {failing && failing > 1 ? failing : null}
      </span>
    );
  }
  if (checks === "pending")
    return (
      <span className="ghpr-row-trail gh-warn">
        <CircleNotchIcon />
      </span>
    );
  if (checks === "passing")
    return (
      <span className="ghpr-row-trail gh-ok">
        <CheckCircleIcon size={14} />
      </span>
    );
  return null;
}

function PrRow({ pr }: { pr: PrItem }) {
  const review = pr.review ?? "open";
  const all = pr.labels ?? [];
  const labels = all.slice(0, 2);
  const extra = all.length - labels.length;
  return (
    <li>
      <button className="ghpr-row">
        <PrReviewIcon state={review} />
        <span className="ghpr-row-main">
          <span className="ghpr-row-title">{pr.title}</span>
          <span className="ghpr-row-meta">
            <span className="ghpr-row-num">#{pr.number}</span>
            <span>{pr.author}</span>
            {review === "draft" && (
              <span className="ghpr-chip ghpr-chip-muted">Draft</span>
            )}
            {pr.conflicts && (
              <span className="ghpr-chip ghpr-chip-err">Conflicts</span>
            )}
            {labels.map((label) => (
              <span className="ghpr-chip" key={label}>
                {label}
              </span>
            ))}
            {extra > 0 && <span className="ghpr-chip">+{extra}</span>}
            <span>{pr.updated}</span>
          </span>
        </span>
        <PrChecksTrail checks={pr.checks} failing={pr.failing} />
      </button>
    </li>
  );
}

/**
 * A row's label is the prompt typed into that specific terminal (its second
 * "command" entry, e.g. "› add structured request logging") rather than a
 * single workspace-wide summary — mirrors the real app's per-terminal row
 * title (the tab's own OSC title), needed once a workspace can run more than
 * one Claude session at a time with different tasks.
 */
function agentTabLabel(tab: DockTab): string {
  const prompt = tab.log.entries.find(
    (entry): entry is Extract<TerminalEntry, { type: "command" }> =>
      entry.type === "command" && entry.text.startsWith("›"),
  );
  return prompt ? prompt.text.replace(/^›\s*/, "") : tab.label;
}

/**
 * One Workspaces-panel status row per agent (Claude) terminal in this
 * workspace — mirrors agent-monitor's per-terminal `AgentRow`, not one
 * aggregate row per workspace. Every agent tab in every *open* workspace now
 * runs its own independently-simulated live status (matching its tab dot
 * exactly), sourced from the same composite-keyed map the Agents view reads —
 * one live source of truth for both.
 */
function workspaceStatusRows(
  item: Workspace,
  liveStates: Record<string, TerminalTabState>,
  activeWorkspaceId: string,
): { id: string; label: string; activity: Status; focused: boolean }[] {
  const terminalDock = item.docks.find((dock) => dock.kind === "terminal");
  const agentTabs =
    terminalDock?.tabs?.filter((tab) => tab.log.kind === "agent") ?? [];
  const isActiveWorkspace = item.id === activeWorkspaceId;
  return agentTabs.map((tab) => ({
    // `tab.id` alone isn't globally unique (every workspace's first Claude tab
    // is typically just "claude"), which would seed identical animation
    // delays across workspaces — scope it to the workspace so dots desync.
    id: `${item.id}:${tab.id}`,
    label: agentTabLabel(tab),
    activity: liveStates[`${item.id}:${tab.id}`]?.status ?? item.status,
    // "Focused" means this exact tab is what's on screen right now: its
    // workspace is the one being viewed, and it's the terminal dock's active
    // tab within it — not merely open somewhere in the background.
    focused: isActiveWorkspace && terminalDock?.activeTab === tab.id,
  }));
}

function entryClassName(entry: TerminalEntry): string {
  if (entry.type === "success") return "terminal-success";
  if (entry.type === "command") return "terminal-command";
  if (entry.type === "agent-text") return "terminal-agent-text";
  if (entry.type === "error") return "terminal-error";
  return "";
}

/**
 * The persistent header a real Claude Code session opens with — icon,
 * version/model/plan, cwd, and an optional MCP-auth warning. It's the first
 * block inside the scrolling log (not fixed chrome), so it scrolls out of
 * view exactly like a real terminal's banner once enough output follows it.
 */
function ClaudeBanner({ agent }: { agent: AgentMeta }) {
  return (
    <div className="claude-banner">
      <div className="claude-banner-row">
        <AgentBrandIcon agentId={agent.agentId} size={28} />
        <div className="claude-banner-copy">
          <div className="claude-banner-title">
            {agent.agentName}
            {agent.version ? ` ${agent.version}` : ""}
          </div>
          {(agent.model || agent.plan) && (
            <div className="claude-banner-meta">
              {[agent.model, agent.plan].filter(Boolean).join(" · ")}
            </div>
          )}
          {agent.cwd && <div className="claude-banner-cwd">{agent.cwd}</div>}
        </div>
      </div>
      {agent.mcpWarning && (
        <div className="claude-banner-warning">
          <WarningIcon />
          <span>{agent.mcpWarning}</span>
        </div>
      )}
    </div>
  );
}

/** Rough, deliberately-approximate token cost of one revealed entry — just enough to make the footer's counter climb plausibly as a session runs. */
function estimateEntryTokens(entry: TerminalEntry): number {
  switch (entry.type) {
    case "tool":
      return 420 + (entry.diff?.length ?? 0) * 35;
    case "table":
      return entry.rows.length * (entry.headers.length + 1) * 18;
    case "subagents":
      return entry.agents.length * 1400;
    case "tasklist":
      return entry.items.length * 90 + 900;
    case "list":
      return Math.round(entry.items.join(" ").length / 3);
    default:
      return Math.round(entry.text.length / 3);
  }
}

function formatTokenCount(n: number): string {
  return n < 1000
    ? `${Math.max(0, Math.round(n))}`
    : `${(n / 1000).toFixed(1)}k`;
}

/**
 * Claude Code's own pinned bottom chrome — an input row plus its status
 * line (folder/branch, running token count, model, activity) — sitting
 * below the scrolling log the same way it does in the real CLI, rather than
 * scrolling away with the conversation.
 */
function ClaudeChrome({
  workspace,
  agent,
  status,
  entries,
}: {
  workspace: Workspace;
  agent: AgentMeta;
  status: Status;
  entries: TerminalEntry[];
}) {
  const folder =
    workspace.path.split("/").filter(Boolean).pop() ?? workspace.name;
  const tokens = formatTokenCount(
    entries.reduce((sum, entry) => sum + estimateEntryTokens(entry), 0),
  );
  const modelWord = (agent.model ?? "claude").split(" ")[0].toLowerCase();
  const statusWord =
    status === "working" ? "work" : status === "waiting" ? "wait" : "idle";
  return (
    <div className="claude-chrome">
      <div className="claude-prompt-row">
        <span className="claude-prompt-caret">›</span>
      </div>
      <div className="claude-status-row">
        <span className="claude-status-left">
          {folder} <span className="claude-branch">({workspace.branch})</span>
        </span>
        <span className="claude-status-right">
          <span>{tokens} tok</span>
          <span className="claude-model">{modelWord}</span>
          <span className={`status-dot status-${status}`} aria-hidden="true" />
          <span>{statusWord}</span>
        </span>
      </div>
    </div>
  );
}

/** Renders one revealed terminal-log entry — plain text kinds fall through to a single styled line; the rest are richer Claude Code UI (see `demo-config.ts`'s `TerminalEntry`). */
function TerminalEntryView({ entry }: { entry: TerminalEntry }) {
  if (entry.type === "status") return null;

  if (entry.type === "heading")
    return (
      <div className="terminal-heading">
        <RichText text={entry.text} />
      </div>
    );

  if (entry.type === "shell")
    return (
      <div className="terminal-shell-line">
        <span className="terminal-shell-prefix">$</span> {entry.text}
      </div>
    );

  if (entry.type === "list") {
    const items = entry.items.map((item, index) => (
      <li key={index}>
        <RichText text={item} />
      </li>
    ));
    return entry.ordered ? (
      <ol className="terminal-list">{items}</ol>
    ) : (
      <ul className="terminal-list">{items}</ul>
    );
  }

  if (entry.type === "tool") {
    return (
      <div className="terminal-tool">
        <div className="terminal-tool-head">
          <RichText text={entry.text} />
        </div>
        {entry.detail && (
          <div className="terminal-tool-detail">└ {entry.detail}</div>
        )}
        {entry.diff && (
          <div className="terminal-diff">
            {entry.diff.map((line, index) => (
              <div className={`diff-line diff-${line.kind}`} key={index}>
                <span className="diff-gutter">{line.ln ?? ""}</span>
                <span className="diff-marker">
                  {line.kind === "add" ? "+" : line.kind === "del" ? "-" : ""}
                </span>
                <span className="diff-text">{line.text || " "}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (entry.type === "table") {
    return (
      <table className="terminal-table">
        <thead>
          <tr>
            {entry.headers.map((header, index) => (
              <th key={index}>
                <RichText text={header} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entry.rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>
                  <RichText text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  if (entry.type === "subagents") {
    return (
      <div className="terminal-subagents">
        {entry.lead && (
          <div className="terminal-subagents-lead">● {entry.lead}</div>
        )}
        <div className="terminal-subagents-tree">
          {entry.agents.map((agentRow, index) => {
            const isLast = index === entry.agents.length - 1;
            return (
              <div className="subagent-row" key={index}>
                <div className="subagent-line">
                  <span className="subagent-branch">
                    {isLast ? "└─" : "├─"}
                  </span>
                  <span
                    className={`subagent-label ${agentRow.state === "running" ? "is-running" : ""}`}
                  >
                    {agentRow.label}
                  </span>
                  {(agentRow.toolUses !== undefined || agentRow.tokens) && (
                    <span className="subagent-meta">
                      {" "}
                      ·{" "}
                      {agentRow.toolUses !== undefined
                        ? `${agentRow.toolUses} tool uses`
                        : ""}
                      {agentRow.tokens ? ` · ${agentRow.tokens}` : ""}
                    </span>
                  )}
                </div>
                {agentRow.detail && (
                  <div className="subagent-detail-line">
                    <span className="subagent-branch subagent-branch-sub">
                      {isLast ? "  " : "│ "}
                    </span>
                    <span>
                      {agentRow.state === "done" ? "Done" : agentRow.detail}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {entry.note && (
          <div className="terminal-subagents-note">{entry.note}</div>
        )}
      </div>
    );
  }

  if (entry.type === "tasklist") {
    return (
      <div className="terminal-tasklist">
        {entry.title && (
          <div className="tasklist-title">
            <span className="tasklist-bullet">*</span>{" "}
            <RichText text={entry.title} />
            {entry.meta && (
              <span className="tasklist-meta"> ({entry.meta})</span>
            )}
          </div>
        )}
        <div className="tasklist-items">
          {entry.items.map((item, index) => (
            <div
              className={`tasklist-item ${item.done ? "is-done" : ""}`}
              key={index}
            >
              <span className="tasklist-check">{item.done ? "✓" : "○"}</span>
              <span className="tasklist-text">
                <RichText text={item.text} />
              </span>
            </div>
          ))}
        </div>
        {entry.more !== undefined && (
          <div className="tasklist-more">… +{entry.more} completed</div>
        )}
      </div>
    );
  }

  return (
    <div className={entryClassName(entry)}>
      {entry.text.split("\n").map((line, index) => (
        <div key={index}>
          <RichText text={line || " "} />
        </div>
      ))}
    </div>
  );
}

function TerminalDockPane({
  dock,
  activeTab,
  tabStates,
  workspace,
  onSelectTab,
}: {
  dock: DockConfig;
  activeTab: DockTab | undefined;
  tabStates: Record<string, TerminalTabState>;
  workspace: Workspace;
  onSelectTab: (tabId: string) => void;
}) {
  const tabState = activeTab ? tabStates[activeTab.id] : undefined;
  const entries = tabState?.entries ?? [];
  const agent =
    activeTab && activeTab.log.kind === "agent"
      ? activeTab.log.agent
      : undefined;
  const linesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = linesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length, activeTab?.id]);

  return (
    <section className="dock-pane terminal-pane" style={paneFlex(dock.size)}>
      <div className="dock-tabs">
        {dock.tabs?.map((tab) => (
          <button
            key={tab.id}
            className={`dock-tab ${dock.activeTab === tab.id ? "is-active" : ""}`}
            data-demo-target={`dock-tab:${dock.id}:${tab.id}`}
            onClick={() => onSelectTab(tab.id)}
          >
            {tab.log.kind === "agent" && (
              <span className="dock-tab-agent-icon">
                <AgentBrandIcon agentId={tab.log.agent.agentId} />
              </span>
            )}
            <span className="dock-tab-label">
              {tab.log.kind === "agent" ? agentTabLabel(tab) : tab.label}
            </span>
            {tab.log.kind === "agent" && (
              <StatusDot
                status={tabStates[tab.id]?.status ?? "ready"}
                seed={tab.id}
                className={`dock-tab-agent-dot${isSeenReady(tabStates[tab.id]?.status ?? "ready", dock.activeTab === tab.id) ? " idle-dot" : ""}`}
              />
            )}
            <span className="dock-tab-close">×</span>
          </button>
        ))}
        <button className="dock-tab-action">⛶</button>
        <button className="dock-tab-action">+</button>
      </div>
      <div className="terminal-head">
        <div className="terminal-breadcrumb">
          projects › {workspace.name} › {activeTab?.label}
        </div>
      </div>
      <div
        className={`terminal-lines agent-terminal ${agent ? "is-agent" : ""}`}
        ref={linesRef}
      >
        {agent && <ClaudeBanner agent={agent} />}
        {entries.map((entry, index) => (
          <TerminalEntryView key={index} entry={entry} />
        ))}
      </div>
      {agent && (
        <ClaudeChrome
          workspace={workspace}
          agent={agent}
          status={tabState?.status ?? "ready"}
          entries={entries}
        />
      )}
    </section>
  );
}

function EditorDockPane({
  files,
  activeFile,
  workspaceName,
  fileLines,
  highlighted,
  highlightedLine,
  size,
  onSelectFile,
}: {
  files: string[];
  activeFile: string;
  workspaceName: string;
  fileLines: string[];
  highlighted: boolean;
  highlightedLine: number;
  size?: number;
  onSelectFile: (file: string) => void;
}) {
  return (
    <section className="dock-pane editor-pane" style={paneFlex(size)}>
      <div className="dock-tabs">
        {files.map((file) => (
          <button
            key={file}
            className={`dock-tab ${activeFile === file ? "is-active" : ""}`}
            data-demo-target={`dock-tab:editor:${file}`}
            onClick={() => onSelectFile(file)}
          >
            <span>{file}</span>
            <span className="dock-tab-close">×</span>
          </button>
        ))}
        <button className="dock-tab-action">⛶</button>
        <button className="dock-tab-action">+</button>
      </div>
      <div className="editor-breadcrumb">
        projects&nbsp; › &nbsp;{workspaceName}&nbsp; › &nbsp;{activeFile}
      </div>
      <div className="editor-area">
        <div className="line-numbers">
          {fileLines.map((_, index) => (
            <span key={index}>{String(index + 1).padStart(2, "0")}</span>
          ))}
        </div>
        <div className="code-content">
          {fileLines.map((line, index) => (
            <div
              className={`code-line ${index === highlightedLine ? "line-highlight" : ""}`}
              key={index}
            >
              <span className="code-text">
                {highlighted
                  ? highlightLine(line).map((token, tokenIndex) => (
                      <span key={tokenIndex} className={token.className}>
                        {token.text}
                      </span>
                    ))
                  : line || " "}
              </span>
            </div>
          ))}
        </div>
        <div className="minimap">
          <span />
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
      </div>
    </section>
  );
}

/** Fallback for a webview's `viewportWidth` — the width the preview renders at before being scaled to the pane. */
const DEFAULT_WEBVIEW_VIEWPORT_WIDTH = 900;

function WebviewDockPane({ dock }: { dock: DockConfig }) {
  const webview = dock.webview;
  const frameRef = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState({ width: 0, height: 0 });

  // The scale has to be measured rather than expressed in CSS: `scale()` takes a
  // unitless number, and no CSS length (cqw included) can be divided down into one.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setFrameSize({ width, height });
    });
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  if (!webview) return null;
  const viewportWidth = webview.viewportWidth ?? DEFAULT_WEBVIEW_VIEWPORT_WIDTH;
  const scale = frameSize.width ? frameSize.width / viewportWidth : 0;
  return (
    <section className="dock-pane webview-pane" style={paneFlex(dock.size)}>
      <div className="dock-tabs">
        <button className="dock-tab is-active">
          <span>{webview.url}</span>
          <span className="dock-tab-close">×</span>
        </button>
        <button className="dock-tab-action">⛶</button>
        <button className="dock-tab-action">↻</button>
      </div>
      <div className="preview-panel">
        <div className="browser-chrome">
          <span /> <span /> <span /> {webview.url}
        </div>
        {/* The page loads at a desktop width and is scaled down to the pane, so the
            preview reads as a real site rather than its narrow mobile layout. */}
        <div className="preview-frame" ref={frameRef}>
          {scale > 0 && (
            <iframe
              srcDoc={webview.html}
              title={webview.url}
              scrolling="no"
              style={{
                width: viewportWidth,
                height: frameSize.height / scale,
                transform: `scale(${scale})`,
              }}
            />
          )}
        </div>
      </div>
    </section>
  );
}

/** Extensions with a pending update — the count that lights the status bar's gear indicator. */
const PENDING_UPDATES = REGISTRY_ENTRIES.filter(
  (entry) => entry.state === "update-available",
).length;

/**
 * A mock of the real Settings dialog (SettingsDialog.tsx) showing only its
 * Extensions page. Deliberately inert: the rail lists every page but only
 * Extensions is selected, and nothing inside the page acts — the list scrolls,
 * and the backdrop or ✕ closes. Enough to show that Silo has extensions and
 * that some of them have updates.
 */
function SettingsDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div
        className="settings-dialog"
        role="dialog"
        aria-label="Settings"
        onClick={(event) => event.stopPropagation()}
      >
        <nav className="settings-rail">
          <div className="settings-rail-title">Settings</div>
          {SETTINGS_PAGES.map((page) => (
            <div
              key={page.id}
              className={`settings-rail-item${page.id === "extensions" ? " active" : ""}${page.group ? " group-start" : ""}`}
            >
              <span className="settings-rail-item-label">{page.title}</span>
            </div>
          ))}
        </nav>
        <section className="settings-pane">
          <div className="ext-page">
            <div className="ext-header">
              <h2>Extensions</h2>
              <div className="ext-header-actions">
                <div className="silo-segmented">
                  <span className="silo-segmented-tab" data-active="true">
                    Browse
                  </span>
                  <span className="silo-segmented-tab">
                    Installed
                    {PENDING_UPDATES > 0 ? ` (${PENDING_UPDATES})` : ""}
                  </span>
                </div>
                <span className="ext-icon-btn">
                  <DotsVerticalIcon size={16} />
                </span>
              </div>
            </div>
            <div className="silo-search-input">
              <span className="silo-search-input-icon">
                <SearchGlyphIcon />
              </span>
              <input
                type="text"
                placeholder="Search the extension registry…"
                spellCheck={false}
                readOnly
              />
            </div>
            <div className="ext-cats">
              <span className="ext-cat ext-cat-active">all</span>
              {REGISTRY_CATEGORIES.map((category) => (
                <span className="ext-cat" key={category}>
                  {category}
                </span>
              ))}
            </div>
            <div className="ext-list">
              {REGISTRY_ENTRIES.map((entry) => {
                const publisher = entry.id.slice(0, entry.id.indexOf("."));
                return (
                  <div className="ext-row" key={entry.id}>
                    <div className="ext-row-top">
                      <div className="ext-row-text">
                        <span className="ext-label">
                          {entry.name}
                          <span className="ext-brand">
                            {publisher[0].toUpperCase() + publisher.slice(1)}
                          </span>
                          <span className="ext-version">v{entry.version}</span>
                          {entry.state === "installed" && (
                            <span className="ext-badge ext-badge-ok">
                              Installed
                            </span>
                          )}
                          {entry.state === "update-available" && (
                            <span className="ext-badge ext-badge-warn">
                              Update available
                            </span>
                          )}
                        </span>
                        <span className="ext-hint">{entry.description}</span>
                        <span className="ext-hint">
                          {entry.id}
                          {" · "}
                          {entry.permissions?.length
                            ? `permissions: ${entry.permissions.join(", ")}`
                            : "no permissions"}
                          {" · "}
                          {entry.installedFrom ? (
                            <span className="ext-source-note">
                              Installed from {entry.installedFrom}
                            </span>
                          ) : (
                            `${entry.downloads} downloads`
                          )}
                        </span>
                      </div>
                      <div className="ext-actions">
                        {entry.state === "update-available" && (
                          <span className="ext-btn ext-btn-primary">
                            Update
                          </span>
                        )}
                        {entry.state === "not-installed" && (
                          <span className="ext-btn">Install</span>
                        )}
                        <span className="ext-icon-btn ext-icon-btn-sm">
                          <DotsVerticalIcon size={14} />
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
        <button
          className="settings-close"
          onClick={onClose}
          title="Close (Esc)"
          aria-label="Close settings"
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M4 4l8 8M12 4l-8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

/** A read-only summary of a workspace's failed CI runs — closes on the X or a click outside, same as `SettingsDialog`, but has no working actions of its own (Copy/View/Re-run/Clear alerts are all inert, mirroring every other decorative row button in this prototype). */
function GithubActionsModal({
  actions,
  onClose,
}: {
  actions: GithubActionsConfig;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div
        className="ghactions-dialog"
        role="dialog"
        aria-label="GitHub Actions"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="ghactions-header">
          <h2>GitHub Actions</h2>
          <button
            type="button"
            className="ghactions-close"
            data-demo-target="close-github-actions"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="ghactions-repo">
          <RepoIcon size={14} />
          {actions.repo}
        </div>
        <div className="ghactions-branchrow">
          <span className="ghactions-branch">
            <GitMergeIcon size={12} />
            {actions.branch}
          </span>
          <span className="ghactions-updated">
            Updated {actions.updatedLabel}
            <RefreshIcon size={12} />
          </span>
        </div>
        <div className="ghactions-divider" />
        <div className="ghactions-statusrow">
          <span className="ghactions-failed-label">
            <span className="status-dot status-failed" />
            FAILED
            <span className="ghactions-failed-count">
              {actions.runs.length}
            </span>
          </span>
          <button type="button" className="ghactions-clear">
            Clear alerts
          </button>
        </div>
        <ul className="ghactions-runs">
          {actions.runs.map((run) => (
            <li className="ghactions-run" key={run.id}>
              <span className="ghactions-run-icon">
                <XCircleIcon size={16} />
              </span>
              <div className="ghactions-run-main">
                <div className="ghactions-run-top">
                  <span className="ghactions-run-title">
                    {run.name} #{run.id}
                  </span>
                  <span className="ghactions-run-actions">
                    <button type="button" className="ghactions-action-btn">
                      <CopyIcon />
                      Copy
                    </button>
                    <button type="button" className="ghactions-action-btn">
                      <ExternalLinkIcon />
                      View
                    </button>
                    <button type="button" className="ghactions-rerun-btn">
                      <RefreshIcon size={12} />
                      Re-run
                    </button>
                  </span>
                </div>
                <div className="ghactions-run-meta">
                  <span className="ghactions-run-tag">{run.branchTag}</span>
                  <span>{run.ago}</span>
                  {run.prNumber && <span>PR #{run.prNumber}</span>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/**
 * The interactive workspace widget — toolbar, Navigator, docks, footer — on
 * its own. Each mount is driven by a {@link DemoScene}: which workspaces
 * exist, which start open (layout from each workspace `config.json`), and
 * which script orchestrates them. Used for the homepage hero and for cropped
 * feature vignettes in the recorder; multiple instances on one page stay
 * independent.
 */
export type DemoWorkspaceProps = {
  /** Isolated mini-demo. Defaults to the homepage hero scene. */
  scene?: DemoScene;
  /**
   * Workspace catalog to filter `scene.workspaceIds` against.
   * Defaults to the hero-only set; the recorder passes the full catalog.
   */
  workspaceCatalog?: Workspace[];
  /** Key in `scene.scripts`. Defaults to `scene.defaultScript`. */
  scriptKey?: string;
  /** Rare override of the scene script (prefer `scriptKey`). */
  script?: DemoScriptStep[];
  focusable?: boolean;
  hideScriptCursor?: boolean;
  /** When false, pause scripted playback. Default true. */
  scripting?: boolean;
  /** Bump to restart the script from index 0. */
  scriptGeneration?: number;
  /**
   * When false, stop at the end of the script instead of looping.
   * Used by the vignette recorder timeline. Default true (homepage hero).
   */
  scriptLoop?: boolean;
  /**
   * When false, user clicks inside the demo do not pause the script.
   * Recorder sets this so transport stays in control. Default true.
   */
  pauseOnUserClick?: boolean;
  /** Fired when a non-looping script reaches the end. */
  onScriptEnded?: () => void;
  /**
   * Absolute script time to scrub to (ms). Pair with `scriptSeekRequest`
   * (bump to re-apply the same time). Used by the vignette recorder playhead.
   */
  scriptSeekMs?: number;
  scriptSeekRequest?: number;
  /**
   * When set (vignette recorder), the demo is driven by this clock instead of
   * internal step timers — playhead and toast/actions stay locked together.
   */
  scriptClockMs?: number | null;
};

export function DemoWorkspace({
  scene = heroScene,
  workspaceCatalog = baseWorkspaces,
  scriptKey,
  script: scriptOverride,
  focusable = false,
  hideScriptCursor = false,
  scripting = true,
  scriptGeneration = 0,
  scriptLoop = true,
  pauseOnUserClick = true,
  onScriptEnded,
  scriptSeekMs = 0,
  scriptSeekRequest = 0,
  scriptClockMs = null,
}: DemoWorkspaceProps) {
  const script = scriptOverride ?? sceneScript(scene, scriptKey);
  const catalog = useMemo(
    () =>
      workspaceCatalog.filter((workspace) =>
        scene.workspaceIds.includes(workspace.id),
      ),
    [scene, workspaceCatalog],
  );
  const initialOpenIds = scene.initialOpenIds;

  const [workspaces, setWorkspaces] = useState(catalog);
  const [openWorkspaceIds, setOpenWorkspaceIds] =
    useState<string[]>(initialOpenIds);
  const [activeId, setActiveIdState] = useState(initialOpenIds[0]);
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [navigatorView, setNavigatorView] =
    useState<NavigatorView>("workspaces");
  const [showViewMenu, setShowViewMenu] = useState(false);
  const [playback, setPlayback] = useState({
    playing: scripting,
    index: 0,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showGithubActions, setShowGithubActions] = useState(false);
  const [showWorktreeToast, setShowWorktreeToast] = useState(false);
  /** Mounted toast lifecycle so dismiss can play a short exit animation. */
  const [worktreeToastPhase, setWorktreeToastPhase] = useState<
    "hidden" | "visible" | "leaving"
  >("hidden");
  /** Scripted reveal of the extension-demo TODOs rail tab. */
  const [revealTodosPanel, setRevealTodosPanel] = useState(false);
  /** Absolute script ms when Claude was started (null = idle banner only). */
  const [claudeTerminalOriginMs, setClaudeTerminalOriginMs] = useState<
    number | null
  >(null);
  /** Absolute script ms when Codex was revealed (null = still hidden). */
  const [codexTerminalOriginMs, setCodexTerminalOriginMs] = useState<
    number | null
  >(null);
  const [scriptCursor, setScriptCursor] = useState({
    visible: false,
    clicking: false,
    x: 50,
    y: 50,
  });
  const demoWrapRef = useRef<HTMLElement>(null);
  const scriptedClickRef = useRef(false);
  const scriptingRef = useRef(scripting);
  scriptingRef.current = scripting;
  const onScriptEndedRef = useRef(onScriptEnded);
  onScriptEndedRef.current = onScriptEnded;
  /** After a scrub, remaining ms before the pending step should fire. */
  const stepDelayOverrideRef = useRef<number | null>(null);
  /** How many scripted clicks the clock-driven path has already applied. */
  const clockClickCountRef = useRef(0);

  useEffect(() => {
    if (showWorktreeToast) {
      setWorktreeToastPhase("visible");
      return;
    }
    setWorktreeToastPhase((phase) =>
      phase === "visible" || phase === "leaving" ? "leaving" : "hidden",
    );
  }, [showWorktreeToast]);

  useEffect(() => {
    if (worktreeToastPhase !== "leaving") return;
    const timer = window.setTimeout(() => {
      setWorktreeToastPhase((phase) =>
        phase === "leaving" ? "hidden" : phase,
      );
    }, 160);
    return () => window.clearTimeout(timer);
  }, [worktreeToastPhase]);

  const pausePlayback = useCallback(() => {
    if (scriptedClickRef.current) return;
    setPlayback((current) =>
      current.playing ? { ...current, playing: false } : current,
    );
    setScriptCursor((current) => ({
      ...current,
      visible: false,
      clicking: false,
    }));
  }, []);

  // Any real click anywhere in the demo halts the script — the visitor is
  // driving now. A listener on the wrapper rather than per-handler calls, so a
  // control that doesn't otherwise mutate demo state (the settings gear, a
  // modal, a panel tab) still stops playback. Capture phase so it lands before
  // the clicked control's own handler; scripted clicks are dispatched with
  // `scriptedClickRef` set and are ignored by `pausePlayback`.
  useEffect(() => {
    if (!pauseOnUserClick) return;
    const wrap = demoWrapRef.current;
    if (!wrap) return;
    wrap.addEventListener("click", pausePlayback, true);
    return () => wrap.removeEventListener("click", pausePlayback, true);
  }, [pausePlayback, pauseOnUserClick]);
  const active =
    workspaces.find((workspace) => workspace.id === activeId) ?? workspaces[0];
  const openWorkspaces = workspaces.filter((workspace) =>
    openWorkspaceIds.includes(workspace.id),
  );
  const closedWorkspaces = workspaces.filter(
    (workspace) => !openWorkspaceIds.includes(workspace.id),
  );

  useEffect(() => {
    if (!focusable) return;
    if (new URLSearchParams(window.location.search).has("focus")) {
      document.body.dataset.focus = "demo";
      window.setTimeout(
        () => demoWrapRef.current?.scrollIntoView({ block: "start" }),
        80,
      );
    }
  }, [focusable]);

  // Controlled pause: scripting===false mirrors pausePlayback (playing:false).
  // When scriptClockMs is driving the demo, ignore scripting for step timers.
  useEffect(() => {
    if (scriptClockMs != null) {
      setPlayback((current) =>
        current.playing ? { ...current, playing: false } : current,
      );
      return;
    }
    if (!scripting) {
      setPlayback((current) =>
        current.playing ? { ...current, playing: false } : current,
      );
      setScriptCursor((current) => ({
        ...current,
        visible: false,
        clicking: false,
      }));
      return;
    }
    setPlayback((current) =>
      current.playing ? current : { ...current, playing: true },
    );
  }, [scripting, scriptClockMs]);

  // Bump scriptGeneration to restart from index 0 (resets workspace state).
  useEffect(() => {
    stepDelayOverrideRef.current = null;
    clockClickCountRef.current = 0;
    setWorkspaces(catalog);
    setOpenWorkspaceIds(initialOpenIds);
    setActiveIdState(initialOpenIds[0]);
    setShowWorkspaceMenu(false);
    setNavigatorView("workspaces");
    setShowViewMenu(false);
    setShowSettings(false);
    setShowGithubActions(false);
    setShowWorktreeToast(false);
    setWorktreeToastPhase("hidden");
    setRevealTodosPanel(false);
    setClaudeTerminalOriginMs(null);
    setCodexTerminalOriginMs(null);
    setScriptCursor({
      visible: false,
      clicking: false,
      x: 50,
      y: 50,
    });
    setPlayback({
      playing: scriptClockMs != null ? false : scriptingRef.current,
      index: 0,
    });
  }, [scriptGeneration, catalog, initialOpenIds]);

  // Clock-driven mode (recorder): derive toast / clicks / cursor from the playhead.
  useEffect(() => {
    if (scriptClockMs == null) return;
    const plan = planScriptSeek(script, scriptClockMs);

    if (plan.clicks.length < clockClickCountRef.current) {
      clockClickCountRef.current = 0;
      setWorkspaces(catalog);
      setOpenWorkspaceIds(initialOpenIds);
      setActiveIdState(initialOpenIds[0]);
      setShowWorkspaceMenu(false);
      setNavigatorView("workspaces");
      setShowViewMenu(false);
      setShowSettings(false);
      setShowGithubActions(false);
    }

    // Apply new clicks while targets may still be mounted, then sync toast.
    if (plan.clicks.length > clockClickCountRef.current) {
      const added = plan.clicks.slice(clockClickCountRef.current);
      clockClickCountRef.current = plan.clicks.length;
      const wrap = demoWrapRef.current;
      for (const selector of added) {
        const target = wrap?.querySelector<HTMLElement>(selector);
        if (!target) continue;
        scriptedClickRef.current = true;
        target.click();
        scriptedClickRef.current = false;
      }
    }

    setShowWorktreeToast(plan.showWorktreeToast);
    setRevealTodosPanel(plan.revealTodosPanel);
    setClaudeTerminalOriginMs(plan.claudeTerminalOriginMs);
    setCodexTerminalOriginMs(plan.codexTerminalOriginMs);

    if (hideScriptCursor || !plan.cursor) {
      setScriptCursor((current) =>
        current.visible || current.clicking
          ? { ...current, visible: false, clicking: false }
          : current,
      );
      return;
    }

    const wrap = demoWrapRef.current;
    const target = wrap?.querySelector<HTMLElement>(plan.cursor.selector);
    if (!wrap || !target) {
      setScriptCursor((current) =>
        current.visible || current.clicking
          ? { ...current, visible: false, clicking: false }
          : current,
      );
      return;
    }

    const wrapRect = wrap.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const targetX =
      ((targetRect.left + targetRect.width / 2 - wrapRect.left) /
        wrapRect.width) *
      100;
    const targetY =
      ((targetRect.top + targetRect.height / 2 - wrapRect.top) /
        wrapRect.height) *
      100;
    const progress = plan.cursor.travelProgress;
    let fromX = targetX;
    let fromY = SCRIPT_CURSOR_TOP_Y_PCT;
    if (plan.cursor.fromSelector) {
      const fromEl = wrap.querySelector<HTMLElement>(plan.cursor.fromSelector);
      if (fromEl) {
        const fromRect = fromEl.getBoundingClientRect();
        fromX =
          ((fromRect.left + fromRect.width / 2 - wrapRect.left) /
            wrapRect.width) *
          100;
        fromY =
          ((fromRect.top + fromRect.height / 2 - wrapRect.top) /
            wrapRect.height) *
          100;
      }
    }
    const x = fromX + (targetX - fromX) * progress;
    const y = fromY + (targetY - fromY) * progress;
    const clicking = plan.cursor.clicking;
    setScriptCursor((current) => {
      if (
        current.visible &&
        current.clicking === clicking &&
        Math.abs(current.x - x) < 0.05 &&
        Math.abs(current.y - y) < 0.05
      ) {
        return current;
      }
      return { visible: true, clicking, x, y };
    });
  }, [scriptClockMs, script, hideScriptCursor]);

  // Scrub to an absolute script time (legacy seek path when not clock-driven).
  useEffect(() => {
    if (scriptClockMs != null) return;
    if (scriptSeekRequest <= 0) return;
    const plan = planScriptSeek(script, scriptSeekMs);
    stepDelayOverrideRef.current = plan.delayMs;
    const needsClickReplay = plan.clicks.length > 0;
    if (needsClickReplay) {
      setWorkspaces(catalog);
      setOpenWorkspaceIds(initialOpenIds);
      setActiveIdState(initialOpenIds[0]);
      setShowWorkspaceMenu(false);
      setNavigatorView("workspaces");
      setShowViewMenu(false);
      setShowSettings(false);
      setShowGithubActions(false);
    }
    setShowWorktreeToast(plan.showWorktreeToast);
    setRevealTodosPanel(plan.revealTodosPanel);
    setClaudeTerminalOriginMs(plan.claudeTerminalOriginMs);
    setCodexTerminalOriginMs(plan.codexTerminalOriginMs);
    setScriptCursor({
      visible: false,
      clicking: false,
      x: 50,
      y: 50,
    });
    setPlayback({ playing: false, index: plan.nextIndex });

    if (!needsClickReplay) return;
    const timer = window.setTimeout(() => {
      const wrap = demoWrapRef.current;
      if (!wrap) return;
      for (const selector of plan.clicks) {
        const target = wrap.querySelector<HTMLElement>(selector);
        if (!target) continue;
        scriptedClickRef.current = true;
        target.click();
        scriptedClickRef.current = false;
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [scriptSeekRequest, scriptSeekMs, script, scriptClockMs]);

  useEffect(() => {
    if (scriptClockMs != null) return;
    if (!playback.playing) return;
    if (playback.index >= script.length) {
      if (!scriptLoop) {
        setPlayback((current) =>
          current.playing ? { ...current, playing: false } : current,
        );
        setScriptCursor((current) => ({
          ...current,
          visible: false,
          clicking: false,
        }));
        onScriptEndedRef.current?.();
        return;
      }
      const loopTimer = window.setTimeout(() => {
        setScriptCursor((current) => ({
          ...current,
          visible: false,
          clicking: false,
        }));
        setWorkspaces(catalog);
        setOpenWorkspaceIds(initialOpenIds);
        setActiveIdState(initialOpenIds[0]);
        setShowWorkspaceMenu(false);
        setNavigatorView("workspaces");
        setShowViewMenu(false);
        setShowWorktreeToast(false);
        setRevealTodosPanel(false);
        setClaudeTerminalOriginMs(null);
        setCodexTerminalOriginMs(null);
        setPlayback((current) => ({ ...current, index: 0 }));
      }, LOOP_PAUSE_MS);
      return () => window.clearTimeout(loopTimer);
    }
    const step = script[playback.index];
    const delayOverride = stepDelayOverrideRef.current;
    stepDelayOverrideRef.current = null;

    if (!isDemoScriptClickStep(step)) {
      const timer = window.setTimeout(() => {
        if (step.action === "show-worktree-toast") setShowWorktreeToast(true);
        if (step.action === "hide-worktree-toast") setShowWorktreeToast(false);
        if (step.action === "reveal-todos-panel") setRevealTodosPanel(true);
        if (
          step.action === "start-claude-terminal" ||
          step.action === "reveal-codex-tab"
        ) {
          const elapsed = script
            .slice(0, playback.index + 1)
            .reduce((sum, item) => sum + item.afterMs, 0);
          if (step.action === "start-claude-terminal")
            setClaudeTerminalOriginMs(elapsed);
          if (step.action === "reveal-codex-tab")
            setCodexTerminalOriginMs(elapsed);
        }
        setPlayback((current) => ({ ...current, index: current.index + 1 }));
      }, delayOverride ?? step.afterMs);
      return () => window.clearTimeout(timer);
    }

    // After a scrub mid-click-step: wait remaining time, then click once.
    if (delayOverride != null) {
      let releaseTimer = 0;
      const advance = () =>
        setPlayback((current) => ({ ...current, index: current.index + 1 }));
      const timer = window.setTimeout(() => {
        const wrap = demoWrapRef.current;
        const target = wrap?.querySelector<HTMLElement>(step.selector);
        if (!wrap || !target) {
          advance();
          return;
        }
        scriptedClickRef.current = true;
        target.click();
        scriptedClickRef.current = false;
        releaseTimer = window.setTimeout(advance, 260);
      }, delayOverride);
      return () => {
        window.clearTimeout(timer);
        window.clearTimeout(releaseTimer);
      };
    }

    let clickTimer = 0;
    let releaseTimer = 0;
    let travelRaf = 0;
    const advance = () =>
      setPlayback((current) => ({ ...current, index: current.index + 1 }));
    const timer = window.setTimeout(() => {
      const wrap = demoWrapRef.current;
      const target = wrap?.querySelector<HTMLElement>(step.selector);
      if (!wrap || !target) {
        advance();
        return;
      }
      const wrapRect = wrap.getBoundingClientRect();
      const targetRect = target.getBoundingClientRect();
      const x =
        ((targetRect.left + targetRect.width / 2 - wrapRect.left) /
          wrapRect.width) *
        100;
      const y =
        ((targetRect.top + targetRect.height / 2 - wrapRect.top) /
          wrapRect.height) *
        100;
      if (!hideScriptCursor) {
        // First appearance: enter from the top. Later steps: CSS-glide from
        // the current position to the next target.
        setScriptCursor((current) => {
          if (current.visible) {
            return { visible: true, clicking: false, x, y };
          }
          travelRaf = requestAnimationFrame(() => {
            travelRaf = requestAnimationFrame(() => {
              setScriptCursor({ visible: true, clicking: false, x, y });
            });
          });
          return {
            visible: true,
            clicking: false,
            x,
            y: SCRIPT_CURSOR_TOP_Y_PCT,
          };
        });
      }
      clickTimer = window.setTimeout(() => {
        if (!hideScriptCursor) {
          setScriptCursor((current) => ({
            ...current,
            visible: true,
            clicking: true,
          }));
        }
        scriptedClickRef.current = true;
        target.click();
        scriptedClickRef.current = false;
        releaseTimer = window.setTimeout(() => {
          setScriptCursor((current) => ({ ...current, clicking: false }));
          advance();
        }, 260);
      }, step.holdMs ?? 880);
    }, step.afterMs);
    return () => {
      window.clearTimeout(timer);
      window.clearTimeout(clickTimer);
      window.clearTimeout(releaseTimer);
      cancelAnimationFrame(travelRaf);
    };
  }, [
    playback.playing,
    playback.index,
    script,
    hideScriptCursor,
    scriptLoop,
    scriptClockMs,
  ]);

  const revealCodexTab = codexTerminalOriginMs != null;
  const terminalVisibleKeys = useMemo(() => {
    const keys: string[] = [];
    for (const workspace of catalog) {
      if (!openWorkspaceIds.includes(workspace.id)) continue;
      for (const dock of workspace.docks) {
        if (dock.kind !== "terminal") continue;
        for (const tab of dock.tabs ?? []) {
          if (
            workspace.id === "terminals-demo" &&
            tab.id === "codex" &&
            !revealCodexTab
          ) {
            continue;
          }
          keys.push(`${workspace.id}:${tab.id}`);
        }
      }
    }
    return keys;
  }, [catalog, openWorkspaceIds, revealCodexTab]);
  const terminalOrigins = useMemo((): Record<string, number> => {
    const origins: Record<string, number> = {
      // Cursor always free-runs from playhead 0.
      "terminals-demo:cursor": 0,
    };
    // Idle until start-claude-terminal — Infinity keeps the transcript empty.
    origins["terminals-demo:claude"] =
      claudeTerminalOriginMs ?? Number.POSITIVE_INFINITY;
    if (codexTerminalOriginMs != null) {
      origins["terminals-demo:codex"] = codexTerminalOriginMs;
    }
    return origins;
  }, [claudeTerminalOriginMs, codexTerminalOriginMs]);

  const liveStates = useLiveTerminalStates(
    catalog,
    openWorkspaceIds,
    scriptClockMs,
    terminalVisibleKeys,
    terminalOrigins,
  );

  const displayDocks = useMemo(() => {
    return active.docks.map((dock) => {
      if (dock.kind !== "terminal") return dock;
      if (active.id !== "terminals-demo") return dock;
      if (dock.id === "agents-left") {
        return {
          ...dock,
          tabs: revealCodexTab
            ? dock.tabs
            : dock.tabs?.filter((tab) => tab.id !== "codex"),
          activeTab: revealCodexTab ? "codex" : "cursor",
        };
      }
      return dock;
    });
  }, [active.docks, active.id, revealCodexTab]);

  // How many of the active workspace's agents are actively working right
  // now — the footer's non-failed Actions item reads this instead of the
  // old single working/waiting/ready summary, so multiple agents running in
  // parallel actually show up as a count.
  const runningAgentCount = workspaceStatusRows(
    active,
    liveStates,
    activeId,
  ).filter((row) => row.activity === "working").length;
  // The active workspace's slice, re-keyed down to plain tab ids — every
  // existing single-workspace consumer (the terminal pane, its dock-tab
  // dots) only ever needs "this workspace's" tabs and expects that shape.
  const terminalTabStates = useMemo(() => {
    const prefix = `${active.id}:`;
    const out: Record<string, TerminalTabState> = {};
    for (const [key, value] of Object.entries(liveStates)) {
      if (key.startsWith(prefix)) out[key.slice(prefix.length)] = value;
    }
    return out;
  }, [liveStates, active.id]);
  const activeFileLines = useMemo(
    () => (active.fileContents[active.activeFile] ?? "").split("\n"),
    [active.fileContents, active.activeFile],
  );
  const activeFileHighlighted = isHighlightable(active.activeFile);
  const highlightedLine = Math.floor(activeFileLines.length / 2);

  function updateActive(update: (workspace: Workspace) => Workspace) {
    pausePlayback();
    setWorkspaces((current) =>
      current.map((workspace) =>
        workspace.id === active.id ? update(workspace) : workspace,
      ),
    );
  }

  function selectWorkspace(workspaceId: string) {
    pausePlayback();
    setActiveIdState(workspaceId);
  }

  function setActiveId(workspaceId: string) {
    selectWorkspace(workspaceId);
  }

  function selectPanel(side: Side, panelId: string) {
    pausePlayback();
    updateActive((workspace) => ({
      ...workspace,
      activePanels: { ...workspace.activePanels, [side]: panelId },
    }));
  }

  function selectDockTab(dockId: string, tab: string) {
    updateActive((workspace) => ({
      ...workspace,
      docks: workspace.docks.map((dock) =>
        dock.id === dockId ? { ...dock, activeTab: tab } : dock,
      ),
    }));
  }

  /**
   * The Agents view spans every open workspace, so picking a row has to do
   * more than `selectWorkspace` — it also has to make that row's own tab the
   * one showing in the terminal pane. `updateActive` (and thus
   * `selectDockTab`) only ever touches the *currently* active workspace, so
   * a plain `selectWorkspace` + `selectDockTab` pair here would still be
   * reading the old `active.id` from this render's stale closure. Target
   * `workspaceId` directly instead of going through `active`.
   */
  function selectAgentRow(workspaceId: string, tabId: string) {
    pausePlayback();
    setActiveIdState(workspaceId);
    setWorkspaces((current) =>
      current.map((workspace) =>
        workspace.id === workspaceId
          ? {
              ...workspace,
              docks: workspace.docks.map((dock) =>
                dock.kind === "terminal" ? { ...dock, activeTab: tabId } : dock,
              ),
            }
          : workspace,
      ),
    );
  }

  function toggleSide(side: Side) {
    pausePlayback();
    updateActive((workspace) => ({
      ...workspace,
      collapsed: { ...workspace.collapsed, [side]: !workspace.collapsed[side] },
    }));
  }

  function openWorkspace(id: string) {
    pausePlayback();
    setOpenWorkspaceIds((current) =>
      current.includes(id) ? current : [...current, id],
    );
    setActiveIdState(id);
    setShowWorkspaceMenu(false);
  }

  function closeWorkspace(id: string) {
    if (openWorkspaceIds.length <= 1) return;
    pausePlayback();
    const next = openWorkspaceIds.filter((openId) => openId !== id);
    setOpenWorkspaceIds(next);
    if (activeId === id) setActiveIdState(next[0]);
  }

  function toggleWorkspaceMenu() {
    pausePlayback();
    setShowViewMenu(false);
    setShowWorkspaceMenu((current) => !current);
  }

  function toggleViewMenu() {
    pausePlayback();
    setShowWorkspaceMenu(false);
    setShowViewMenu((current) => !current);
  }

  function selectNavigatorView(view: NavigatorView) {
    pausePlayback();
    setNavigatorView(view);
    setShowViewMenu(false);
  }

  const rightPanels =
    revealTodosPanel && active.id === "extension-demo"
      ? [
          ...active.panels.right.filter((panel) => panel.id !== "todos"),
          { id: "todos", label: "TODOs", kind: "todos" as const },
        ]
      : active.panels.right;
  const rightActiveId =
    revealTodosPanel && active.id === "extension-demo"
      ? "todos"
      : active.activePanels.right;

  return (
    <section
      className="demo-wrap"
      data-vignette-root
      aria-label="Interactive Silo workspace demo"
      ref={demoWrapRef}
    >
      <div className="demo-toolbar">
        <div className="traffic-lights">
          <i />
          <i />
          <i />
        </div>
      </div>
      <div className="demo-body">
        <aside
          className={`side-column left-column ${active.collapsed.left ? "is-collapsed" : ""}`}
        >
          {!active.collapsed.left && (
            <div className="demo-side-split">
              <DemoSidePane
                panels={active.panels.left}
                activeId={active.activePanels.left}
                onSelect={(id) => selectPanel("left", id)}
                workspace={active}
                workspaces={openWorkspaces}
                activeWorkspaceId={activeId}
                onWorkspaceSelect={setActiveId}
                onCloseWorkspace={closeWorkspace}
                closedWorkspaces={closedWorkspaces}
                showWorkspaceMenu={showWorkspaceMenu}
                onToggleWorkspaceMenu={toggleWorkspaceMenu}
                onOpenWorkspace={openWorkspace}
                liveStates={liveStates}
                navigatorView={navigatorView}
                showViewMenu={showViewMenu}
                onToggleViewMenu={toggleViewMenu}
                onSelectNavigatorView={selectNavigatorView}
                onSelectAgent={selectAgentRow}
                size={
                  active.splitPanels?.left?.length
                    ? active.splitSize?.left
                    : undefined
                }
              />
              {!!active.splitPanels?.left?.length && (
                <>
                  <div className="demo-split-handle" />
                  <DemoSidePane
                    panels={active.splitPanels.left}
                    activeId={active.activeSplitPanels?.left ?? ""}
                    onSelect={(id) =>
                      updateActive((workspace) => ({
                        ...workspace,
                        activeSplitPanels: {
                          ...workspace.activeSplitPanels,
                          left: id,
                        },
                      }))
                    }
                    workspace={active}
                  />
                </>
              )}
            </div>
          )}
        </aside>
        <section className="center-column">
          <div className="center-docks">
            {displayDocks.map((dock) => {
              if (dock.kind === "terminal") {
                const dockActiveTab = dock.tabs?.find(
                  (tab) => tab.id === dock.activeTab,
                );
                return (
                  <TerminalDockPane
                    key={dock.id}
                    dock={dock}
                    activeTab={dockActiveTab}
                    tabStates={terminalTabStates}
                    workspace={active}
                    onSelectTab={(tabId) => selectDockTab(dock.id, tabId)}
                  />
                );
              }
              if (dock.kind === "editor")
                return (
                  <EditorDockPane
                    key={dock.id}
                    files={active.files}
                    activeFile={active.activeFile}
                    workspaceName={active.name}
                    fileLines={activeFileLines}
                    highlighted={activeFileHighlighted}
                    highlightedLine={highlightedLine}
                    size={dock.size}
                    onSelectFile={(file) =>
                      updateActive((workspace) => ({
                        ...workspace,
                        activeFile: file,
                      }))
                    }
                  />
                );
              if (dock.kind === "webview")
                return <WebviewDockPane key={dock.id} dock={dock} />;
              return null;
            })}
          </div>
        </section>
        <aside
          className={`side-column right-column ${active.collapsed.right ? "is-collapsed" : ""}`}
        >
          {!active.collapsed.right && (
            <div className="demo-side-split">
              <DemoSidePane
                panels={rightPanels}
                activeId={rightActiveId}
                onSelect={(id) => selectPanel("right", id)}
                workspace={active}
                size={
                  active.splitPanels?.right?.length
                    ? active.splitSize?.right
                    : undefined
                }
              />
              {!!active.splitPanels?.right?.length && (
                <>
                  <div className="demo-split-handle" />
                  <DemoSidePane
                    panels={active.splitPanels.right}
                    activeId={active.activeSplitPanels?.right ?? ""}
                    onSelect={(id) =>
                      updateActive((workspace) => ({
                        ...workspace,
                        activeSplitPanels: {
                          ...workspace.activeSplitPanels,
                          right: id,
                        },
                      }))
                    }
                    workspace={active}
                  />
                </>
              )}
            </div>
          )}
        </aside>
      </div>
      <div className="demo-footer">
        <div className="status-workspace">
          <span className="workspace-status-icon">▦</span>
          {active.name}
        </div>
        <div className="status-items">
          {active.githubActions?.runs.length ? (
            <button
              type="button"
              className="status-actions-failed"
              data-demo-target="status-actions"
              onClick={() => setShowGithubActions(true)}
            >
              <WorkflowIcon size={12} /> Actions:{" "}
              {active.githubActions.runs.length} failed
            </button>
          ) : (
            <span className="status-actions-normal">
              <WorkflowIcon size={12} /> Actions:{" "}
              {runningAgentCount > 0 ? `${runningAgentCount} running` : "Ready"}
            </span>
          )}
          <span>CPU 67%</span>
          <span>MEM 85%</span>
          <span className="status-theme">
            <ThemeSwatch />
            Dark
          </span>
          <button
            className="status-action settings-status-btn"
            type="button"
            aria-label={
              PENDING_UPDATES > 0
                ? "Settings (extension updates available)"
                : "Settings"
            }
            onClick={() => setShowSettings(true)}
          >
            <GearIcon />
            {PENDING_UPDATES > 0 && (
              <span className="settings-status-badge" aria-hidden="true" />
            )}
          </button>
          <button
            className="status-action"
            type="button"
            data-demo-target="toggle-side:left"
            aria-label={`${active.collapsed.left ? "Show" : "Hide"} left panel`}
            aria-pressed={!active.collapsed.left}
            onClick={() => toggleSide("left")}
          >
            <PanelToggleIcon side="left" open={!active.collapsed.left} />
          </button>
          <button
            className="status-action"
            type="button"
            data-demo-target="toggle-side:right"
            aria-label={`${active.collapsed.right ? "Show" : "Hide"} right panel`}
            aria-pressed={!active.collapsed.right}
            onClick={() => toggleSide("right")}
          >
            <PanelToggleIcon side="right" open={!active.collapsed.right} />
          </button>
        </div>
      </div>
      {scriptCursor.visible && !hideScriptCursor && (
        <div
          className={`demo-script-cursor${scriptCursor.clicking ? " is-clicking" : ""}${scriptClockMs != null ? " is-clock-driven" : ""}`}
          style={{ left: `${scriptCursor.x}%`, top: `${scriptCursor.y}%` }}
          aria-hidden="true"
        >
          <svg
            className="demo-script-pointer"
            viewBox="0 0 24 24"
            width="20"
            height="20"
          >
            <path d="M4 2 L4 18 L8.5 14.5 L11.5 21 L14 20 L11 13.5 L17 13.5 Z" />
          </svg>
          <span className="demo-script-ripple" />
        </div>
      )}
      {worktreeToastPhase !== "hidden" && (
        <div className="demo-toasts" data-record-region="worktree-toast">
          <div
            className={`demo-toast demo-toast-info${worktreeToastPhase === "leaving" ? " is-leaving" : ""}`}
            role="status"
            onAnimationEnd={(event) => {
              if (event.animationName !== "demo-toast-out") return;
              setWorktreeToastPhase((phase) =>
                phase === "leaving" ? "hidden" : phase,
              );
            }}
          >
            <svg
              className="demo-toast-icon"
              viewBox="0 0 16 16"
              width="16"
              height="16"
              aria-hidden="true"
            >
              <circle cx="8" cy="8" r="7" fill="currentColor" />
              <path
                d="M8 4.5a.75.75 0 0 1 .75.75v.5a.75.75 0 0 1-1.5 0v-.5A.75.75 0 0 1 8 4.5Zm0 3a.75.75 0 0 1 .75.75v3a.75.75 0 0 1-1.5 0v-3A.75.75 0 0 1 8 7.5Z"
                fill="#0f1219"
              />
            </svg>
            <div className="demo-toast-content">
              <div className="demo-toast-title">New worktree detected</div>
              <div className="demo-toast-message">
                &ldquo;xerro-agent-worktree-test&rdquo;
                (test/silo-worktree-detection-5) was created. Add it to your
                workspace?
              </div>
              <div className="demo-toast-actions">
                <button
                  type="button"
                  className="demo-toast-action"
                  data-demo-target="worktree-toast-add"
                  onClick={() => setShowWorktreeToast(false)}
                >
                  Add to workspace
                </button>
              </div>
            </div>
            <button
              type="button"
              className="demo-toast-close"
              data-demo-target="worktree-toast-dismiss"
              aria-label="Dismiss"
              onClick={() => setShowWorktreeToast(false)}
            >
              ×
            </button>
          </div>
        </div>
      )}
      {showSettings && (
        <SettingsDialog onClose={() => setShowSettings(false)} />
      )}
      {showGithubActions && active.githubActions && (
        <GithubActionsModal
          actions={active.githubActions}
          onClose={() => setShowGithubActions(false)}
        />
      )}
      {(showWorkspaceMenu || showViewMenu) && (
        <div
          className="workspace-menu-backdrop"
          onClick={() => {
            setShowWorkspaceMenu(false);
            setShowViewMenu(false);
          }}
        />
      )}
    </section>
  );
}

function PanelHeader({
  panels,
  activeId,
  onSelect,
}: {
  panels: SidePanel[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="panel-header">
      {panels.map((item) => (
        <button
          key={item.id}
          className={`panel-tab ${activeId === item.id ? "is-active" : ""}`}
          data-demo-target={`panel:${item.id}`}
          onClick={() => onSelect(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function DemoSidePane({
  panels,
  activeId,
  onSelect,
  workspace,
  workspaces,
  activeWorkspaceId,
  onWorkspaceSelect,
  onCloseWorkspace,
  closedWorkspaces,
  showWorkspaceMenu,
  onToggleWorkspaceMenu,
  onOpenWorkspace,
  liveStates,
  navigatorView,
  showViewMenu,
  onToggleViewMenu,
  onSelectNavigatorView,
  onSelectAgent,
  size,
}: {
  panels: SidePanel[];
  activeId: string;
  onSelect: (id: string) => void;
  workspace: Workspace;
  workspaces?: Workspace[];
  activeWorkspaceId?: string;
  onWorkspaceSelect?: (id: string) => void;
  onCloseWorkspace?: (id: string) => void;
  closedWorkspaces?: Workspace[];
  showWorkspaceMenu?: boolean;
  onToggleWorkspaceMenu?: () => void;
  onOpenWorkspace?: (id: string) => void;
  /** Live activity status for every open workspace's agent tabs, composite-keyed `${workspaceId}:${tabId}` — overrides a row's static config status. */
  liveStates?: Record<string, TerminalTabState>;
  navigatorView?: NavigatorView;
  showViewMenu?: boolean;
  onToggleViewMenu?: () => void;
  onSelectNavigatorView?: (view: NavigatorView) => void;
  /** Agents-view row pick: switches to that row's workspace *and* focuses its own tab, unlike `onWorkspaceSelect` which only does the former. */
  onSelectAgent?: (workspaceId: string, tabId: string) => void;
  /** Height of this pane, in percent, when the column is split. Omit to fall back to the CSS default. */
  size?: number;
}) {
  const selected = panels.find((item) => item.id === activeId) ?? panels[0];
  if (!selected)
    return (
      <div
        className="demo-side-pane demo-side-pane-empty"
        style={paneFlex(size)}
      />
    );
  return (
    <div className="demo-side-pane" style={paneFlex(size)}>
      <PanelHeader panels={panels} activeId={selected.id} onSelect={onSelect} />
      <div className="demo-side-content">
        <SidePanelContent
          panel={selected}
          workspace={workspace}
          workspaces={workspaces}
          activeId={activeWorkspaceId}
          onWorkspaceSelect={onWorkspaceSelect}
          onCloseWorkspace={onCloseWorkspace}
          closedWorkspaces={closedWorkspaces}
          showWorkspaceMenu={showWorkspaceMenu}
          onToggleWorkspaceMenu={onToggleWorkspaceMenu}
          onOpenWorkspace={onOpenWorkspace}
          liveStates={liveStates}
          navigatorView={navigatorView}
          showViewMenu={showViewMenu}
          onToggleViewMenu={onToggleViewMenu}
          onSelectNavigatorView={onSelectNavigatorView}
          onSelectAgent={onSelectAgent}
        />
      </div>
    </div>
  );
}

type NavigatorFixture = {
  id: string;
  name: string;
  folder: string;
  color?: string;
  badge?: string;
  statuses?: {
    id: string;
    label: string;
    activity: Status;
    elapsed?: string;
    focused?: boolean;
  }[];
  /** A failed-CI alert line, shown above `statuses` — see `GithubActionsConfig`. */
  ciFailed?: { count: number; elapsed: string };
};

function NavigatorWorkspaceRow({
  item,
  active,
  onClick,
  onClose,
}: {
  item: NavigatorFixture;
  active?: boolean;
  onClick?: () => void;
  onClose?: () => void;
}) {
  return (
    <li
      className={`ws-item ${active ? "active" : ""}`}
      data-demo-target={`workspace:${item.id}`}
      onClick={onClick}
    >
      <span className="ws-icon" aria-hidden="true">
        <i />
        <i />
        <i />
        <i />
      </span>
      <div className="ws-name-row">
        <span className="ws-name">{item.name}</span>
        {item.badge && <span className="ws-badge">{item.badge}</span>}
        <button
          type="button"
          className="ws-close"
          data-demo-target={`close-workspace:${item.id}`}
          onClick={(event) => {
            event.stopPropagation();
            onClose?.();
          }}
          aria-label={`Close ${item.name}`}
        >
          ×
        </button>
      </div>
      <div className="ws-folder">
        <span className="ws-folder-path">{item.folder}</span>
      </div>
      {item.ciFailed && (
        <div className="ws-status-row">
          <span className="status-dot status-failed" />
          <span className="ws-status-label">
            {item.ciFailed.count} workflow{item.ciFailed.count === 1 ? "" : "s"}{" "}
            failed
          </span>
          <span className="ws-status-elapsed">{item.ciFailed.elapsed}</span>
        </div>
      )}
      {item.statuses?.map((status) => (
        <div className="ws-status-row" key={status.id}>
          <StatusDot
            status={status.activity}
            seed={status.id}
            className={
              isSeenReady(status.activity, !!status.focused)
                ? "idle-dot"
                : undefined
            }
          />
          <span className="ws-status-label">{status.label}</span>
          {status.elapsed && (
            <span className="ws-status-elapsed">{status.elapsed}</span>
          )}
        </div>
      ))}
    </li>
  );
}

/** Leading icon + color for an issue's state — the prototype's stand-in for the real panel's `stateIcon`. */
function IssueStateIcon({ state }: { state: IssueState }) {
  if (state === "closed-completed")
    return (
      <span className="ghi-row-icon gh-accent">
        <CheckCircleIcon />
      </span>
    );
  if (state === "closed-not-planned")
    return (
      <span className="ghi-row-icon gh-muted">
        <XCircleOutlineIcon />
      </span>
    );
  return (
    <span className="ghi-row-icon gh-ok">
      <CircleIcon />
    </span>
  );
}

/**
 * Black or white, whichever reads better on a GitHub label's own color — the
 * same YIQ threshold the real panel's `labelTextColor` uses, so a chip's text
 * stays legible whether the label is pale yellow or deep purple.
 */
function labelTextColor(hex: string): string {
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 >= 128 ? "#000000" : "#ffffff";
}

function IssueRow({ issue }: { issue: IssueItem }) {
  const all = issue.labels ?? [];
  const labels = all.slice(0, 2);
  const extra = all.length - labels.length;
  const assignees = issue.assignees ?? [];
  return (
    <li>
      <button className="ghi-row">
        <IssueStateIcon state={issue.state ?? "open"} />
        <span className="ghi-row-main">
          <span className="ghi-row-title">{issue.title}</span>
          <span className="ghi-row-meta">
            <span className="ghi-row-num">#{issue.number}</span>
            <span>{issue.author}</span>
            {labels.map((label) => (
              <span
                className="ghi-chip ghi-chip-label"
                key={label.name}
                style={{
                  backgroundColor: `#${label.color}`,
                  color: labelTextColor(label.color),
                }}
              >
                {label.name}
              </span>
            ))}
            {extra > 0 && <span className="ghi-chip">+{extra}</span>}
            {assignees.length > 0 && (
              <span className="ghi-chip ghi-chip-muted">
                {assignees[0]}
                {assignees.length > 1 ? ` +${assignees.length - 1}` : ""}
              </span>
            )}
            <span>{issue.updated}</span>
          </span>
        </span>
      </button>
    </li>
  );
}

/** `"12s"` / `"9m"` / `"4h"` / `"2d"` — mirrors agent-monitor's `formatElapsed`. */
function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

type AgentBucket = "ready" | "working" | "idle";

/**
 * Where a row sits in the Agents view's three fixed sections. "working" is
 * direct from live status; a "ready" (just-finished) tab only reads as
 * genuinely "ready" for the first stretch of its own pause window — past
 * that it's been sitting long enough to read as "idle", reusing the
 * terminal's own `loopPauseMs` as the yardstick for "a while."
 */
function agentBucket(
  status: Status,
  since: number,
  loopPauseMs: number,
): AgentBucket {
  if (status === "working") return "working";
  return Date.now() - since < loopPauseMs * 0.4 ? "ready" : "idle";
}

type AgentRow = {
  key: string;
  workspaceId: string;
  tabId: string;
  agentId: string;
  title: string;
  workspaceName: string;
  status: Status;
  since: number;
  bucket: AgentBucket;
  focused: boolean;
};

/** Flattens every open workspace's agent (Claude Code/Cursor/…) tabs into one list — the same live source `workspaceStatusRows` reads, just cutting across workspaces instead of grouping by one. */
function buildAgentRows(
  openWorkspaces: Workspace[],
  liveStates: Record<string, TerminalTabState>,
  activeWorkspaceId: string,
): AgentRow[] {
  const rows: AgentRow[] = [];
  for (const workspace of openWorkspaces) {
    const terminalDock = workspace.docks.find(
      (dock) => dock.kind === "terminal",
    );
    const agentTabs =
      terminalDock?.tabs?.filter(
        (
          tab,
        ): tab is DockTab & { log: Extract<TerminalLog, { kind: "agent" }> } =>
          tab.log.kind === "agent",
      ) ?? [];
    const isActiveWorkspace = workspace.id === activeWorkspaceId;
    for (const tab of agentTabs) {
      const key = `${workspace.id}:${tab.id}`;
      const live = liveStates[key];
      const status = live?.status ?? workspace.status;
      const since = live?.since ?? Date.now();
      const loopPauseMs = tab.log.loopPauseMs ?? TERMINAL_LOOP_PAUSE_MS;
      const focused = isActiveWorkspace && terminalDock?.activeTab === tab.id;
      rows.push({
        key,
        workspaceId: workspace.id,
        tabId: tab.id,
        agentId: tab.log.agent.agentId,
        title: agentTabLabel(tab),
        workspaceName: workspace.name,
        status,
        since,
        bucket: agentBucket(status, since, loopPauseMs),
        focused,
      });
    }
  }
  return rows;
}

const AGENT_SECTIONS: { bucket: AgentBucket; label: string }[] = [
  { bucket: "ready", label: "Ready" },
  { bucket: "working", label: "Working" },
  { bucket: "idle", label: "Idle" },
];

/**
 * The agent-monitor extension's "by status" Navigator view, recreated: every
 * open workspace's agent terminals in one flat list, grouped into three
 * always-shown sections (even empty, matching the real extension) and sorted
 * most-recently-changed-first within each.
 */
function AgentsListView({
  rows,
  onSelect,
}: {
  rows: AgentRow[];
  onSelect?: (workspaceId: string, tabId: string) => void;
}) {
  return (
    <div className="ap-list">
      {AGENT_SECTIONS.map((section) => {
        const sectionRows = rows
          .filter((row) => row.bucket === section.bucket)
          .sort((a, b) => b.since - a.since);
        return (
          <div className="ap-section" key={section.bucket}>
            <div className="ap-section-title">
              <span>{section.label}</span>
              <span className="ap-section-count">{sectionRows.length}</span>
            </div>
            {sectionRows.map((row) => (
              <div
                className={`ap-row ${row.focused ? "active" : ""}`}
                key={row.key}
                data-demo-target={`agent-row:${row.key}`}
                onClick={() => onSelect?.(row.workspaceId, row.tabId)}
              >
                <StatusDot
                  status={row.status}
                  seed={row.key}
                  className={`ap-row-dot${row.bucket === "idle" || isSeenReady(row.status, row.focused) ? " idle-dot" : ""}`}
                />
                <div className="ap-row-body">
                  <div className="ap-row-title">
                    <AgentBrandIcon agentId={row.agentId} size={11} />
                    <span>{row.title}</span>
                  </div>
                  <div className="ap-row-meta">
                    <span className="ap-row-workspace">
                      {row.workspaceName}
                    </span>
                    <span className="ap-row-sep">·</span>
                    <span className="ap-row-elapsed">
                      {formatElapsed(Date.now() - row.since)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function SidePanelContent({
  panel: selected,
  workspace,
  workspaces = [],
  activeId = workspace.id,
  onWorkspaceSelect,
  onCloseWorkspace,
  closedWorkspaces = [],
  showWorkspaceMenu,
  onToggleWorkspaceMenu,
  onOpenWorkspace,
  liveStates = {},
  navigatorView = "workspaces",
  showViewMenu,
  onToggleViewMenu,
  onSelectNavigatorView,
  onSelectAgent,
}: {
  panel: SidePanel;
  workspace: Workspace;
  workspaces?: Workspace[];
  activeId?: string;
  onWorkspaceSelect?: (id: string) => void;
  onCloseWorkspace?: (id: string) => void;
  closedWorkspaces?: Workspace[];
  showWorkspaceMenu?: boolean;
  onToggleWorkspaceMenu?: () => void;
  onOpenWorkspace?: (id: string) => void;
  liveStates?: Record<string, TerminalTabState>;
  navigatorView?: NavigatorView;
  showViewMenu?: boolean;
  onToggleViewMenu?: () => void;
  onSelectNavigatorView?: (view: NavigatorView) => void;
  onSelectAgent?: (workspaceId: string, tabId: string) => void;
}) {
  if (!selected) return null;
  if (selected.kind === "navigator")
    return (
      <div className="navigator-panel">
        <div className="nav-title">
          <button
            type="button"
            className="nav-view-btn"
            data-demo-target="nav-view-btn"
            onClick={onToggleViewMenu}
            aria-haspopup="menu"
            aria-expanded={showViewMenu}
          >
            <span>{navigatorView === "agents" ? "Agents" : "Workspaces"}</span>
            <CaretDownIcon />
          </button>
          {navigatorView === "workspaces" && (
            <button
              type="button"
              data-demo-target="add-workspace"
              onClick={onToggleWorkspaceMenu}
              aria-label="Open a workspace"
            >
              +
            </button>
          )}
          {showViewMenu && (
            <div className="nav-view-menu" role="menu">
              <div className="nav-view-menu-header">View</div>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={navigatorView === "workspaces"}
                className="nav-view-menu-item"
                data-demo-target="nav-view:workspaces"
                onClick={() => onSelectNavigatorView?.("workspaces")}
              >
                <span className="nav-view-menu-check">
                  {navigatorView === "workspaces" ? "✓" : ""}
                </span>
                Workspaces
              </button>
              <button
                type="button"
                role="menuitemradio"
                aria-checked={navigatorView === "agents"}
                className="nav-view-menu-item"
                data-demo-target="nav-view:agents"
                onClick={() => onSelectNavigatorView?.("agents")}
              >
                <span className="nav-view-menu-check">
                  {navigatorView === "agents" ? "✓" : ""}
                </span>
                Agents
              </button>
            </div>
          )}
          {showWorkspaceMenu && (
            <div className="workspace-menu">
              <div className="workspace-menu-label">Saved</div>
              {closedWorkspaces.length > 0 ? (
                closedWorkspaces.map((item) => (
                  <button
                    key={item.id}
                    className="workspace-menu-item"
                    data-demo-target={`open-workspace:${item.id}`}
                    onClick={() => onOpenWorkspace?.(item.id)}
                  >
                    <span className="workspace-menu-icon" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="workspace-menu-name">{item.name}</span>
                    <span className="workspace-menu-trash">
                      <TrashIcon />
                    </span>
                  </button>
                ))
              ) : (
                <div className="workspace-menu-empty">
                  All workspaces are open
                </div>
              )}
              <div className="workspace-menu-divider" />
              <div className="workspace-menu-action">
                <span className="workspace-menu-action-icon">+</span>New
                workspace…
              </div>
              <div className="workspace-menu-action">
                <span className="workspace-menu-action-icon">
                  <FolderIcon />
                </span>
                New Group…
              </div>
            </div>
          )}
        </div>
        {navigatorView === "agents" ? (
          <AgentsListView
            rows={buildAgentRows(workspaces, liveStates, activeId)}
            onSelect={onSelectAgent}
          />
        ) : (
          <ul className="ws-list">
            {workspaces.map((item) => (
              <NavigatorWorkspaceRow
                key={item.id}
                item={{
                  id: item.id,
                  name: item.name,
                  folder: item.path,
                  color: item.color,
                  statuses: workspaceStatusRows(item, liveStates, activeId),
                  ciFailed: item.githubActions?.runs.length
                    ? {
                        count: item.githubActions.runs.length,
                        elapsed: item.githubActions.runs[0].ago,
                      }
                    : undefined,
                }}
                active={activeId === item.id}
                onClick={() => onWorkspaceSelect?.(item.id)}
                onClose={() => onCloseWorkspace?.(item.id)}
              />
            ))}
          </ul>
        )}
      </div>
    );
  if (selected.kind === "files")
    return (
      <div className="file-tree">
        <div className="tree-root">
          ⌄ <strong>{workspace.name.toUpperCase()}</strong>
        </div>
        {workspace.files.map((name) => (
          <div
            className={`tree-row${name === workspace.activeFile ? " is-active" : ""}`}
            key={name}
          >
            <span>›</span>
            <span>{name}</span>
          </div>
        ))}
      </div>
    );
  if (selected.kind === "todos")
    return (
      <div className="todos-panel">
        <div className="todos-panel-title">TODOS.md</div>
        <ul className="todos-list">
          {[
            "Add invite-by-email for workspace members",
            "Cache the dashboard summary for 30s",
            "Fix flaky timezone tests on CI",
            "Empty state for the activity feed",
            "Export the activity feed as CSV",
          ].map((text) => (
            <li className="todos-item" key={text}>
              <span className="todos-check">○</span>
              <span className="todos-text">{text}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  // Mirrors the file-search extension's FileSearchView: the query box with its
  // Aa/ab/.* toggles overlaid, the include/exclude glob fields, the "N results in
  // M files" summary, then per-file groups of highlighted match lines.
  if (selected.kind === "search") {
    const search = workspace.search;
    const totalMatches = search.files.reduce(
      (sum, file) => sum + file.matches.length,
      0,
    );
    return (
      <div className="fsearch-view">
        <div className="fsearch-controls">
          <div className="fsearch-input-row">
            <input
              type="text"
              className="fsearch-input"
              placeholder="Search"
              defaultValue={search.query}
              spellCheck={false}
            />
            <div className="fsearch-toggles">
              <span
                className={`fsearch-toggle${search.caseSensitive ? " on" : ""}`}
              >
                Aa
              </span>
              <span
                className={`fsearch-toggle${search.wholeWord ? " on" : ""}`}
              >
                ab
              </span>
              <span className={`fsearch-toggle${search.regex ? " on" : ""}`}>
                .*
              </span>
            </div>
          </div>
          <label className="fsearch-field-label">files to include</label>
          <input
            type="text"
            className="fsearch-input fsearch-glob"
            placeholder="e.g. *.ts, src/**"
            defaultValue={search.includes ?? ""}
            spellCheck={false}
          />
          <label className="fsearch-field-label">files to exclude</label>
          <input
            type="text"
            className="fsearch-input fsearch-glob"
            placeholder="e.g. **/dist/**"
            defaultValue={search.excludes ?? ""}
            spellCheck={false}
          />
        </div>
        <div className="fsearch-status">
          {summarizeSearch(totalMatches, search.files.length)}
        </div>
        <div className="fsearch-results">
          {search.files.map((file) => {
            const { name, dir } = splitNameAndDir(file.path);
            return (
              <div className="fsearch-file" key={file.path}>
                <div className="fsearch-file-head">
                  <span className="fsearch-chev">
                    <ChevronDownIcon />
                  </span>
                  <span className="fsearch-file-icon">
                    <FileGlyphIcon size={13} />
                  </span>
                  <span className="fsearch-file-name">{name}</span>
                  {dir && <span className="fsearch-file-dir">{dir}</span>}
                  <span className="fsearch-file-count">
                    {file.matches.length}
                  </span>
                </div>
                <div className="fsearch-match-list">
                  {file.matches.map((line, index) => (
                    <SearchMatchRow
                      key={index}
                      line={line}
                      query={search.query}
                      caseSensitive={!!search.caseSensitive}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }
  // Mirrors the git-explorer extension's GitView: branch header with sync/refresh/
  // worktree/menu actions, the commit box, then the Staged Changes / Changes
  // sections of file rows. "Staged Changes" only appears when something is staged.
  if (selected.kind === "git") {
    const staged = workspace.changes.filter((change) => change.staged);
    const changed = workspace.changes.filter((change) => !change.staged);
    return (
      <div className="git-panel">
        <div className="git-branch">
          <span className="git-branch-name">{workspace.branch}</span>
          <span className="git-branch-sync">
            ↑{workspace.ahead ?? 0} ↓{workspace.behind ?? 0}
          </span>
          <span className="git-branch-action">
            <RefreshIcon size={16} />
          </span>
          <span className="git-branch-action git-branch-action-accent">
            <TreeStructureIcon />
          </span>
          <span className="git-branch-action">
            <DotsVerticalIcon />
          </span>
        </div>
        <div className="git-commit-area">
          <textarea placeholder="Commit message" rows={2} spellCheck={false} />
          <button className="git-commit-btn">
            <CheckIcon />
            <span>Commit</span>
            {staged.length > 0 && (
              <span className="git-commit-count">{staged.length}</span>
            )}
          </button>
        </div>
        <div className="git-sections">
          {staged.length > 0 && (
            <GitSection title="Staged Changes" changes={staged} />
          )}
          <GitSection title="Changes" changes={changed} />
        </div>
      </div>
    );
  }
  // Mirrors the github-issues extension's list view — the same header + row
  // shape as the PRs panel above, but with an issue-state dot instead of a
  // review icon, GitHub-colored label chips, and no trailing CI indicator.
  if (selected.kind === "issues")
    return (
      <div className="ghi">
        <div className="ghi-header">
          <span className="ghi-filter-btn">
            All open
            <CaretDownIcon />
          </span>
          <span className="ghi-icon-btn">
            <RefreshIcon />
          </span>
        </div>
        <div className="ghi-body">
          {workspace.issues.length === 0 ? (
            <div className="ghi-empty">
              <div className="ghi-empty-title">No issues</div>
              <div>Nothing matches “All open” right now.</div>
            </div>
          ) : (
            <ul className="ghi-list">
              {workspace.issues.map((issue) => (
                <IssueRow key={issue.number} issue={issue} />
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  // Mirrors the github-prs extension's list view: a filter + refresh header over
  // a list of rows, each carrying its review-state icon, wrapping title, meta
  // line (#number, author, chips) and a trailing CI indicator.
  if (selected.kind === "prs")
    return (
      <div className="ghpr">
        <div className="ghpr-header">
          <span className="ghpr-filter-btn">
            All open
            <CaretDownIcon />
          </span>
          <span className="ghpr-icon-btn">
            <RefreshIcon />
          </span>
        </div>
        <div className="ghpr-body">
          {workspace.prs.length === 0 ? (
            <div className="ghpr-empty">
              <div className="ghpr-empty-title">No pull requests</div>
              <div>Nothing matches “All open” right now.</div>
            </div>
          ) : (
            <ul className="ghpr-list">
              {workspace.prs.map((pr) => (
                <PrRow key={pr.number} pr={pr} />
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  // Mirrors the system-monitor extension's SystemMonitorPanel: a stack of cards —
  // Memory (donut + legend), CPU (stacked-bar history + user/system footer), and
  // Processes (one row per session, with the aggregate in the header).
  const system = workspace.system;
  const totalGb = system.memory.reduce((sum, segment) => sum + segment.gb, 0);
  const freeGb =
    system.memory.find((segment) => segment.label.toLowerCase() === "free")
      ?.gb ?? 0;
  const usedGb = totalGb - freeGb;
  const procs = system.processes;
  const aggCpu = procs.rows.reduce((sum, row) => sum + row.cpu, 0);
  const aggMem = procs.rows.reduce((sum, row) => sum + row.memoryMb, 0);
  return (
    <div className="sm-panels">
      <div className="sm-card">
        <div className="sm-header">
          <span className="sm-title">Memory</span>
          <span className="sm-headline">
            {usedGb.toFixed(1)} / {totalGb.toFixed(1)} GB
          </span>
        </div>
        <div className="sm-mem-body">
          <div className="sm-donut">
            <MemoryDonut segments={system.memory} total={totalGb} />
            <div className="sm-donut-center">
              <span className="sm-donut-value">{Math.round(usedGb)}</span>
              <span className="sm-donut-unit">GB</span>
            </div>
          </div>
          <div className="sm-legend">
            {system.memory.map((segment) => (
              <div className="sm-legend-row" key={segment.label}>
                <div
                  className="sm-dot"
                  style={{
                    background:
                      MEM_COLORS[segment.label.toLowerCase()] ?? "#6d7593",
                  }}
                />
                <span className="sm-leg-label">{segment.label}</span>
                <span className="sm-leg-val">
                  {formatBytes(segment.gb * 1024 ** 3)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="sm-card sm-card-cpu">
        <div className="sm-header">
          <span className="sm-title">CPU</span>
          <span className="sm-headline">
            {Math.round(system.cpu.user + system.cpu.sys)}%
          </span>
        </div>
        <CpuChart
          seed={workspace.id}
          user={system.cpu.user}
          sys={system.cpu.sys}
        />
        <div className="sm-cpu-footer">
          <div className="sm-cpu-leg">
            <div className="sm-dot" style={{ background: CPU_USER_COLOR }} />
            User{" "}
            <span className="sm-cpu-pct">{Math.round(system.cpu.user)}%</span>
          </div>
          <div className="sm-cpu-leg">
            <div className="sm-dot" style={{ background: CPU_SYS_COLOR }} />
            System{" "}
            <span className="sm-cpu-pct">{Math.round(system.cpu.sys)}%</span>
          </div>
        </div>
      </div>

      <div className="sm-card sm-card-processes">
        <div className="sm-header">
          <span className="sm-title">Processes</span>
          <span className="sm-headline">
            {procs.procs} proc{procs.procs === 1 ? "" : "s"} ·{" "}
            {formatCpu(aggCpu)} · {formatMem(aggMem)}
          </span>
        </div>
        {procs.rows.length === 0 ? (
          <div className="sm-proc-empty">No terminals in this workspace.</div>
        ) : (
          <div className="sm-proc-rows">
            {procs.rows.map((row) => (
              <div className="sm-proc-row" key={row.title}>
                {row.childCount ? (
                  <span className="sm-proc-chevron">
                    <ChevronRightIcon />
                  </span>
                ) : (
                  <span className="sm-proc-leaf-dot" />
                )}
                <span className="sm-proc-title">
                  <span className="sm-proc-title-text">
                    {row.title}
                    {row.childCount ? (
                      <span className="sm-proc-child-count">
                        {" "}
                        ({row.childCount})
                      </span>
                    ) : null}
                  </span>
                  {row.idle && <span className="sm-proc-idle-pill">idle</span>}
                </span>
                <span className="sm-proc-leader">
                  {row.idle ? "" : (row.leader ?? "")}
                </span>
                <span className={procStatClass(row.cpu, 25, 75)}>
                  {formatCpu(row.cpu)}
                </span>
                <span className={procStatClass(row.memoryMb, 500, 2000)}>
                  {formatMem(row.memoryMb)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * The **Chat panel** (RFC 0038 / 0039) — a center-dock transcript for one Chat
 * session: streaming text, the agent's thinking, tool-call rows, its plan, and
 * inline permission requests.
 *
 * ## It is built on the SDK and nothing else
 *
 * `silo.agents-chat-panel` (`packages/extensions-silo/src/agents-chat-panel/`)
 * depends on `@silo-code/sdk` **only** — `@silo-code/extensions-silo` resolves
 * the privileged `@silo-code/extension-host/internal` surface nowhere in its
 * dependency graph, so anything this panel needed from it would fail to
 * resolve rather than pass review. It started life as
 * `examples/extensions/acp-chat`, a separately-built example package proving
 * the same constraint from outside the workspace; Session 8 of the Agent
 * Sessions sprint relocated it here (same constraint, faster inner loop — Vite
 * HMR instead of a manual `node build.mjs`). The whole panel runs on
 * `ctx.agents.sessions` plus `@silo-code/sdk` types and kit components — if
 * something here needed more, the fix is to widen `ctx`, never to reach around
 * it (RFC 0038 acceptance criterion 2, now met by the shipping UI).
 *
 * The spike's `@acp-components` dependency is gone. That library owns the
 * protocol client and wants a *transport*, which the SDK deliberately does not
 * hand out (the connection is host-owned); feeding it would have meant
 * re-encoding the SDK's stream back into JSON-RPC frames for a second protocol
 * client to re-parse. The transcript projection it used to provide now lives in
 * `transcript-model.ts` as a pure reducer over `AgentSessionUpdate` — a
 * fraction of the code, no second state library, and testable.
 *
 * ## Chrome
 *
 * Host-drawn (RFC 0039). The panel kind declares `toolbar: { breadcrumb: true }`
 * and the dock frame draws the cwd strip — the same one the editor and terminal
 * panels get — which the panel fills through `api.setBreadcrumb`. The panel
 * body is the SDK kit for every control and design tokens for every colour, so
 * a Chat tab and a terminal tab read as the same kind of thing and both follow
 * the active theme. Nothing in this directory imports a chrome component.
 *
 * ## Reaching it
 *
 * The panel kind declares `chatProfileHost: true`, so starting a **Chat** Agent
 * Profile opens it — from the agent-profile section of a dock's **+** menu, the
 * "New Agent" empty-workspace action, or `core.newAgent`.
 * `ctx.agents.sessions` needs the `"agents"` permission; as a trusted built-in
 * this extension is exempt from declaring it, the same way built-ins are
 * exempt from `fs:*`/`process`.
 *
 * ## Surviving a restart (RFC 0042)
 *
 * `params.sessionId` is this panel's `DockPanelState` (RFC 0041) — restored on
 * mount, cleared on a profile switch. `ctx.agents.sessions.readJournal` paints
 * the prior conversation the moment the panel mounts, independent of
 * `connect({ resume })`, which separately negotiates `session/resume` /
 * `session/load` and falls back to journal-only (composer disabled, "Continue
 * in a new session" offered) rather than ever refusing to open. See
 * `session-restore.ts` for the pure decision logic.
 */

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type ComponentType,
  type MouseEvent,
} from "react";
import {
  ArrowRight,
  ArrowUp,
  ArrowsClockwise,
  ArrowsLeftRight,
  CaretDown,
  CaretRight,
  Command,
  FileText,
  Globe,
  Lightbulb,
  MagnifyingGlass,
  PencilSimple,
  Plug,
  Plus,
  Shield,
  Stop as StopIcon,
  TerminalWindow,
  Trash,
  Wrench,
  type IconProps,
} from "@phosphor-icons/react";
import type {
  AgentCommand,
  AgentInfo,
  AgentPermissionRequest,
  AgentProfileSummary,
  AgentPromptBlock,
  AgentSessionConfigOption,
  AgentSessionHandle,
  Disposable,
  DockPanelProps,
  ExtensionContext,
} from "@silo-code/sdk";
import {
  Badge,
  Button,
  DND_MIME,
  EmptyState,
  IconButton,
  List,
  ListRow,
  MenuButton,
  Textarea,
  Tooltip,
  usePanelEntryFocus,
} from "@silo-code/sdk";
import { chatProfiles, resolveChatProfile } from "./profile-selection";
import {
  applyRestoreStep,
  isClampedScroll,
  isPinnedToBottom,
  persistedScroll,
  restoreIsStable,
  restoreTargetFor,
  scrollToBottom,
  SCROLL_SAVE_DEBOUNCE_MS,
  shouldAbandonRestore,
  transcriptScrollKey,
  type ScrollSnapshot,
} from "./scroll";
import { confirmProfileSwitch } from "./profile-switch";
import { addAttachments, toAttachment, type Attachment } from "./attachments";
import {
  classifyClipboardPaste,
  pastedFileName,
  pastedFilePath,
} from "./paste-attachments";
import {
  clampPaletteIndex,
  commandDisplayTitle,
  commandQueryFromDraft,
  draftAfterCommandPick,
  filterCommands,
  clearShortcutLabel,
  isClearShortcut,
  isReservedDraft,
  paletteNavAction,
  stepPaletteIndex,
  withReservedCommands,
} from "./command-palette";
import {
  ClearSessionDialog,
  type ClearSessionChoice,
} from "./ClearSessionDialog";
import { chatPanelSettingsService } from "./settings-store";
import {
  caretOnFirstLine,
  caretOnLastLine,
  composerCanSend,
  composerSubmitAction,
  composerInputEnabled,
  composerPlaceholder,
  composerShowConnecting,
  composerTextareaHeightPx,
  historyNavDown,
  historyNavUp,
  isDoubleEscape,
  NOT_NAVIGATING_HISTORY,
  type HistoryNavState,
} from "./composer-model";
import {
  appendNotice,
  appendUserMessage,
  applyUpdate,
  closeDanglingTools,
  emptyTranscript,
  foldToolRuns,
  formatToolInput,
  groupTurns,
  sameTurn,
  toolOutputIsMarkdown,
  nextEntryKey,
  seedFromJournal,
  stopReasonNotice,
  toolGroupLabel,
  toolStatusTone,
  userPromptHistory,
  workedForLabel,
  TOOL_GROUP_INLINE_COUNT,
  type RenderEntry,
  type Transcript,
  type Turn,
} from "./transcript-model";
import {
  agentHasBypassMode,
  autoAcceptOptionId,
  permissionButtonVariant,
} from "./permission-options";
import { TranscriptMarkdown } from "./TranscriptMarkdown";
import {
  ChatLinkSpan,
  LinkifiedText,
  chatLinkFromTarget,
} from "./LinkifiedText";
import { isLinkActivationClick } from "./link-policy";
import { isPanelBackgroundClick } from "./panel-focus";
import { resolveChatFilePath } from "./resolve-chat-path";
import { buildChatSelectionMenu } from "./selection-menu";
import {
  formatToolKindLabel,
  toolIconId,
  type ToolIconId,
} from "./tool-display";
import {
  diffHeading,
  diffHeadingParts,
  diffLines,
  toolInputIsDiffOnly,
  toolPathFromRawInput,
  toolShowsInlineDiff,
  type ToolDiff,
} from "./tool-diff";
import { matchChatLinks } from "./link-match";
import {
  isReadOnly,
  panelStateAfterConnect,
  resolveChatCwd,
  restoreOptionFor,
  type RestartIntent,
} from "./session-restore";
import { LiveElapsed } from "./LiveElapsed";
import {
  HEAD_MEASURE_DEBOUNCE_MS,
  HEAD_REVEAL_SETTLE_MS,
  TRANSCRIPT_TAIL_TURNS,
  planIdleDrop,
  revealScrollAdjustment,
  shouldRevealHead,
  spacerHeightPx,
  transcriptWindow,
} from "./transcript-mount";

export interface AcpChatPanelParams {
  /** Seed tab label, shown until the agent declares its own name. */
  title?: string;
  /**
   * Which **Chat** Agent Profile this tab is bound to, persisted so a reopened
   * panel comes back on the same agent. A profile the user has since deleted
   * (or switched to the Terminal arm) falls back to another Chat profile
   * rather than refusing to open — see `resolveChatProfile`.
   */
  profileId?: string;
  /**
   * The session to restore on mount — Chat session resurrection (RFC 0042).
   * `null`/absent means a brand-new session; written back once connected
   * (`AgentSessionHandle.sessionId`), and again whenever `ctx.agents` reports
   * a different one (an in-place `session/load` id-adoption). Cleared on a
   * profile switch — a session belongs to the agent that created it.
   */
  sessionId?: string | null;
  /**
   * The working directory this session runs in, persisted alongside `sessionId`
   * (RFC 0042 `ChatPanelState`) and **authoritative** since RFC 0046: it is the
   * folder the user chose when starting the profile, which in a multi-root
   * workspace is not necessarily the primary one. Absent (or empty) falls back
   * to the workspace's primary folder — see `resolveChatCwd`.
   */
  cwd?: string;
  /**
   * Last transcript scroll offset — read when this panel is created (a
   * restart, or a close-and-reopen from its `DockPanelRecord`). Only applies to
   * the conversation it was saved for; see `persistedScroll`. Tab and
   * workspace switches inside one panel's life are served from a ref, which
   * doesn't wait on this field's debounce.
   */
  scrollTop?: number;
  /**
   * Whether {@link scrollTop} was at the bottom of the transcript. Saved
   * alongside it because a transcript that gained entries while the panel was
   * away should keep *following the stream* rather than come back to the
   * absolute offset the bottom used to be at.
   */
  scrollPinned?: boolean;
  /**
   * The last value seen for each `AgentSessionConfigOption.id` this tab has
   * advertised — permission mode, model, whatever the agent offers. A
   * reconnect (a real restart, or a dev-only Fast Refresh remount) spins up
   * a *new* agent process for `session/resume`, which has no memory of a
   * config choice that only ever lived in that process's own head; this is
   * what lets the panel reassert it instead of falling back to the fresh
   * process's default. Kept current whenever {@link configOptions} changes,
   * from the user's own pick or the agent moving one itself.
   */
  configOptionValues?: Readonly<Record<string, string>>;
}

/** What the panel is doing. `"no-profile"` is a state to render, not an error:
 *  the user simply has no Chat profile yet. */
type Phase =
  | { status: "no-profile" }
  | { status: "connecting" }
  | { status: "ready" }
  | { status: "error"; message: string };

/** One unanswered {@link AgentPermissionRequest}, plus the key its row is
 *  rendered under. */
interface PendingPermission {
  readonly key: string;
  readonly request: AgentPermissionRequest;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** FileList first (Finder / a copied file); fall back to `items` for a
 *  screenshot that never got a path. */
function filesFromDataTransfer(data: DataTransfer): File[] {
  if (data.files.length > 0) return Array.from(data.files);
  const out: File[] = [];
  for (const item of Array.from(data.items)) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file) out.push(file);
  }
  return out;
}

/** What a tool row needs beyond its own `TranscriptEntry` — whether *this*
 *  row is expanded, and how to toggle it. Lifted to the panel (not local
 *  state on a row component) because it must survive the row's own content
 *  changing shape mid-stream (a `tool_call_update` patches the entry in
 *  place; a component keyed on `entry.key` never remounts, so this doesn't
 *  strictly need lifting for that reason — it's lifted because collapse
 *  state is conceptually part of *the transcript's* interaction state, kept
 *  alongside `permissions` and the rest, not a single row's own business. */
interface ToolRowState {
  readonly expandedTools: ReadonlySet<string>;
  readonly onToggleTool: (key: string) => void;
  readonly isMac: boolean;
}

const TOOL_ICONS: Readonly<Record<ToolIconId, ComponentType<IconProps>>> = {
  shell: TerminalWindow,
  read: FileText,
  write: PencilSimple,
  search: MagnifyingGlass,
  delete: Trash,
  move: ArrowRight,
  think: Lightbulb,
  fetch: Globe,
  switch: ArrowsLeftRight,
  mcp: Plug,
  other: Wrench,
};

function ToolDiffBlock({ diff, inline }: { diff: ToolDiff; inline?: boolean }) {
  const lines = diffLines(diff.oldText, diff.newText);
  if (lines.length === 0) return null;
  const heading = diffHeadingParts(diff, lines);
  return (
    <div
      className={
        inline ? "acp-chat__tool-inline-diff" : "acp-chat__tool-section"
      }
    >
      <div className="acp-chat__tool-section-label">
        {heading.prefix}
        {diff.path ? (
          <ChatLinkSpan kind="path" href={diff.path}>
            {heading.name}
          </ChatLinkSpan>
        ) : (
          heading.name
        )}
        {heading.suffix}
      </div>
      <div
        className="acp-chat__diff"
        role="region"
        aria-label={diffHeading(diff, lines)}
      >
        {lines.map((line, i) => (
          <div
            key={`${line.kind}-${i}`}
            className="acp-chat__diff-line"
            data-kind={line.kind}
          >
            <span className="acp-chat__diff-gutter" aria-hidden="true">
              {line.line}
            </span>
            <span className="acp-chat__diff-mark" aria-hidden="true">
              {line.kind === "add" ? "+" : line.kind === "del" ? "-" : " "}
            </span>
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function ToolKindGlyph({
  kind,
  title,
  className,
}: {
  kind?: string;
  title: string;
  className?: string;
}) {
  const Glyph = TOOL_ICONS[toolIconId(kind, title)];
  return <Glyph className={className} size="1em" aria-hidden="true" />;
}

/**
 * One transcript row (RFC 0043 finding 1). A plain function, not a
 * component: every `RenderEntry` (plus, for a tool row, {@link
 * ToolRowState}) carries everything its row needs, so this is reusable for a
 * turn's user message, its `rest`, and a folded group's own members alike
 * without threading the rest of the panel's state through it.
 *
 * A routine tool call is a single compact line — kind glyph, a display
 * label from {@link formatToolKindLabel} (when the agent gave a kind), its
 * title. Only a call blocked on the user earns a
 * box while collapsed (`.acp-chat__permission`). `status` only earns a badge
 * when it's informative: `"pending"`/`"completed"` are the expected states a
 * call passes through silently. Collapsed by default: clicking a row with
 * something to show expands it into a bordered card with **Input** / **Output**
 * wells (`rawInput` vs. the modelled `content` lines).
 *
 * A `"tool-group"` is the one case {@link foldToolRuns} produces rather than
 * the transcript reducer itself — a long run of routine calls, folded to a
 * header plus its {@link TOOL_GROUP_INLINE_COUNT} most recent members. A run
 * with a failed call inside always renders fully open (its `hasError` flag)
 * so a failure is never one click away from view, it is already in it.
 */
function renderTranscriptEntry(entry: RenderEntry, tools: ToolRowState) {
  if (entry.type === "message") {
    return (
      <div key={entry.key} className="acp-chat__message" data-role={entry.role}>
        {entry.role === "thought" ? (
          <div className="acp-chat__thought-label">Thinking</div>
        ) : null}
        {/* The agent writes markdown; the user wrote literal text and their
            asterisks must stay their asterisks. */}
        {entry.role === "user" ? (
          <div className="acp-chat__text">
            <LinkifiedText text={entry.text} />
          </div>
        ) : (
          <TranscriptMarkdown text={entry.text} />
        )}
        {entry.attachments && entry.attachments.length > 0 ? (
          <div className="acp-chat__attachments">
            {entry.attachments.map((name, i) => (
              <span key={`${entry.key}-att-${i}`} className="acp-chat__chip">
                {name}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    );
  }
  if (entry.type === "tool") {
    const diffs = entry.diffs ?? [];
    const hideInput = diffs.length > 0 && toolInputIsDiffOnly(entry.rawInput);
    const inputText = hideInput ? undefined : formatToolInput(entry.rawInput);
    const outputIsDiffPlaceholder =
      diffs.length > 0 &&
      entry.lines.length > 0 &&
      entry.lines.every((line) => line.startsWith("diff "));
    const outputText =
      outputIsDiffPlaceholder || entry.lines.length === 0
        ? ""
        : entry.lines.join("\n");
    const showInlineDiff = toolShowsInlineDiff(entry.toolKind, diffs.length);
    const hasExtras = inputText !== undefined || outputText.length > 0;
    const hasBody = (!showInlineDiff && diffs.length > 0) || hasExtras;
    const expanded = hasBody && tools.expandedTools.has(entry.key);
    const toggle = () => tools.onToggleTool(entry.key);
    const onHeadClick = (e: MouseEvent) => {
      const link = chatLinkFromTarget(e.target);
      if (link && isLinkActivationClick(e, tools.isMac)) return;
      toggle();
    };
    const kindLabel = formatToolKindLabel(entry.toolKind, entry.title);
    // A title with no `/` (e.g. "Edit tool-demo.txt") doesn't match the
    // transcript's generic path regex, which requires one to avoid false
    // positives on things like version numbers. When the tool call names its
    // file directly (a diff's path, or rawInput's `file_path`/`path`), link
    // the whole title to it instead of leaving it dead text.
    const titleFallbackPath =
      diffs[0]?.path ?? toolPathFromRawInput(entry.rawInput);
    const titleNode =
      titleFallbackPath && matchChatLinks(entry.title).length === 0 ? (
        <ChatLinkSpan kind="path" href={titleFallbackPath}>
          {entry.title}
        </ChatLinkSpan>
      ) : (
        <LinkifiedText text={entry.title} />
      );
    return (
      <div
        key={entry.key}
        className="acp-chat__tool"
        data-status={entry.status}
        data-expanded={expanded || undefined}
      >
        <div
          className="acp-chat__tool-head"
          data-interactive={hasBody || undefined}
          role={hasBody ? "button" : undefined}
          tabIndex={hasBody ? 0 : undefined}
          aria-expanded={hasBody ? expanded : undefined}
          onClick={hasBody ? onHeadClick : undefined}
          onKeyDown={
            hasBody
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle();
                  }
                }
              : undefined
          }
        >
          {hasBody ? (
            <span className="acp-chat__tool-icon-stack" aria-hidden="true">
              <ToolKindGlyph
                kind={entry.toolKind}
                title={entry.title}
                className="acp-chat__tool-icon acp-chat__tool-icon--default"
              />
              <CaretRight
                className="acp-chat__tool-icon acp-chat__tool-icon--hover"
                size="1em"
              />
            </span>
          ) : (
            <ToolKindGlyph
              kind={entry.toolKind}
              title={entry.title}
              className="acp-chat__tool-icon"
            />
          )}
          {kindLabel ? (
            <span className="acp-chat__tool-kind">{kindLabel}</span>
          ) : null}
          <span className="acp-chat__tool-title">{titleNode}</span>
          {entry.status === "in_progress" || entry.status === "failed" ? (
            <Badge tone={toolStatusTone(entry.status)} size="sm">
              {entry.status}
            </Badge>
          ) : null}
        </div>
        {showInlineDiff
          ? diffs.map((diff, i) => (
              <ToolDiffBlock
                key={`${diff.path ?? "file"}-${i}`}
                diff={diff}
                inline
              />
            ))
          : null}
        {expanded ? (
          <div className="acp-chat__tool-body">
            {!showInlineDiff
              ? diffs.map((diff, i) => (
                  <ToolDiffBlock
                    key={`${diff.path ?? "file"}-${i}`}
                    diff={diff}
                  />
                ))
              : null}
            {inputText !== undefined ? (
              <div className="acp-chat__tool-section">
                <div className="acp-chat__tool-section-label">Input</div>
                <pre className="acp-chat__tool-pre">
                  <LinkifiedText text={inputText} />
                </pre>
              </div>
            ) : null}
            {outputText.length > 0 ? (
              <div className="acp-chat__tool-section">
                <div className="acp-chat__tool-section-label">Output</div>
                {toolOutputIsMarkdown(outputText) ? (
                  <div className="acp-chat__tool-pre acp-chat__tool-pre--md">
                    <TranscriptMarkdown text={outputText} />
                  </div>
                ) : (
                  <pre className="acp-chat__tool-pre">
                    <LinkifiedText text={outputText} />
                  </pre>
                )}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }
  if (entry.type === "tool-group") {
    // A run with a failed call inside can't be collapsed at all — see the
    // doc comment above this function. Nothing to toggle, so the head isn't
    // interactive, matching how a bodiless tool row already treats `hasBody`.
    const canToggle = !entry.hasError;
    const expanded = entry.hasError || tools.expandedTools.has(entry.key);
    const toggle = () => tools.onToggleTool(entry.key);
    // "Most recent" is the end of the run — entries stream in chronological
    // order, so the calls still worth a glance without expanding are the
    // last ones, not the first.
    const visible = expanded
      ? entry.tools
      : entry.tools.slice(-TOOL_GROUP_INLINE_COUNT);
    const hiddenCount = entry.tools.length - visible.length;
    return (
      <div
        key={entry.key}
        className="acp-chat__tool-group"
        data-expanded={expanded || undefined}
      >
        <div
          className="acp-chat__tool-group-head"
          data-interactive={canToggle || undefined}
          role={canToggle ? "button" : undefined}
          tabIndex={canToggle ? 0 : undefined}
          aria-expanded={canToggle ? expanded : undefined}
          onClick={canToggle ? toggle : undefined}
          onKeyDown={
            canToggle
              ? (e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle();
                  }
                }
              : undefined
          }
        >
          <CaretRight
            className="acp-chat__tool-group-caret"
            size="1em"
            aria-hidden="true"
          />
          <span className="acp-chat__tool-group-label">
            {toolGroupLabel(entry)}
          </span>
          {entry.hasError ? (
            <Badge tone="err" size="sm">
              error
            </Badge>
          ) : null}
        </div>
        <div className="acp-chat__tool-group-body">
          {visible.map((tool) => (
            <TranscriptRow key={tool.key} entry={tool} tools={tools} />
          ))}
          {!expanded && hiddenCount > 0 ? (
            <button
              type="button"
              className="acp-chat__tool-group-more"
              onClick={toggle}
            >
              {hiddenCount} more, expand to see them all
            </button>
          ) : null}
        </div>
      </div>
    );
  }
  if (entry.type === "plan") {
    return (
      <div key={entry.key} className="acp-chat__plan">
        <div className="acp-chat__plan-head">Plan</div>
        <ul className="acp-chat__plan-list">
          {entry.rows.map((row, i) => (
            <li
              key={`${entry.key}-${i}`}
              className="acp-chat__plan-row"
              data-status={row.status}
            >
              {row.content}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div
      key={entry.key}
      className="acp-chat__notice-line"
      data-tone={entry.tone}
    >
      {entry.text}
    </div>
  );
}

/**
 * {@link renderTranscriptEntry} as a memoized component — the unit React is
 * allowed to skip.
 *
 * Both props are stable for a row nothing happened to: `applyUpdate` shares
 * every entry it didn't patch, and the panel memoizes the {@link
 * ToolRowState} object. So the renders that have nothing to do with any
 * particular row — a workspace switch flipping `onScreen`, a chunk landing at
 * the bottom of a long transcript — reconcile one element per row and stop,
 * instead of rebuilding the whole transcript's subtree.
 *
 * `expandedTools` is deliberately passed as the whole set rather than a
 * per-row `expanded` boolean: a toggle is a rare, user-initiated render where
 * re-running every row is cheap (the markdown underneath is memoized on its
 * own text and stays cached), and threading one set is simpler than threading
 * a boolean through a folded group down to its members.
 */
const TranscriptRow = memo(function TranscriptRow({
  entry,
  tools,
}: {
  entry: RenderEntry;
  tools: ToolRowState;
}) {
  return renderTranscriptEntry(entry, tools);
});

/**
 * One turn — its user message, its folded body, and its footer — memoized on
 * {@link sameTurn}.
 *
 * `groupTurns` rebuilds every `Turn` object on each call, so the default
 * shallow compare would never hit; `sameTurn` compares the entries inside
 * instead, which do keep identity. That makes the folding work
 * ({@link foldToolRuns}) and the row reconciliation below it skippable for
 * every turn except the one currently streaming.
 */
const TranscriptTurn = memo(
  function TranscriptTurn({
    turn,
    tools,
    running,
    durationMs,
    startedAt,
  }: {
    turn: Turn;
    tools: ToolRowState;
    running: boolean;
    durationMs: number | undefined;
    startedAt: number | undefined;
  }) {
    const rest = useMemo(() => foldToolRuns(turn.rest), [turn.rest]);
    return (
      <div className="acp-chat__turn">
        {turn.user ? <TranscriptRow entry={turn.user} tools={tools} /> : null}
        {rest.length > 0 ? (
          <div className="acp-chat__turn-body">
            {rest.map((e) => (
              <TranscriptRow key={e.key} entry={e} tools={tools} />
            ))}
          </div>
        ) : null}
        {/* The footer is per turn (RFC 0043 finding 1): "Worked for …"
            once this panel measured a duration for it, a live ticking
            readout for the turn currently streaming, and nothing for a
            leading (no user message) or journal-only turn — there's
            nothing this panel ever timed for either. */}
        {running ? (
          <div className="acp-chat__turn-footer" data-running>
            <ArrowsClockwise
              className="acp-chat__spin"
              size="1em"
              aria-hidden="true"
            />
            <LiveElapsed startedAt={startedAt ?? Date.now()} />
          </div>
        ) : durationMs !== undefined ? (
          <div className="acp-chat__turn-footer">
            {workedForLabel(durationMs)}
          </div>
        ) : null}
      </div>
    );
  },
  (a, b) =>
    a.tools === b.tools &&
    a.running === b.running &&
    a.durationMs === b.durationMs &&
    a.startedAt === b.startedAt &&
    sameTurn(a.turn, b.turn),
);

export function AcpChatPanel({
  api,
  params,
  workspaceId,
  onScreen,
  ctx,
}: DockPanelProps<AcpChatPanelParams> & { ctx: ExtensionContext }) {
  // This panel's own workspace, never "whichever one is active" — a
  // background workspace's dock stays mounted, so a re-render while the user
  // is elsewhere (e.g. an agent-activity update mid-turn) must not recompute
  // `cwd` off whatever workspace they've switched to. That mismatch fed the
  // connect effect's dependency array below, tearing the live session down
  // and reconnecting it under the wrong folder on every workspace switch.
  const ws = ctx.workspaces.getState();
  // The folder picked when this panel was started outranks the workspace's
  // primary one (RFC 0046) — that's the whole point in a multi-root workspace.
  // Safe in the connect effect's deps: it's a string compared by value, and the
  // write-back below stores the same value it read, so this is a fixed point.
  const cwd = resolveChatCwd(
    params.cwd,
    ws.all.find((w) => w.id === workspaceId)?.folder ?? "",
  );

  // Bumped to retry a failed connection (or a first one that found no profile).
  const [nonce, setNonce] = useState(0);
  // Read on every render rather than memoized: `list()` is already memoized
  // host-side and returns the same frozen array until the user edits their
  // profiles, so this is one `filter` over a handful of entries — and a
  // profile added on Settings → Agents while the panel is open shows up in the
  // picker without a nudge.
  const available = chatProfiles(ctx.agents.profiles.list());

  const [requestedId, setRequestedId] = useState(params.profileId);
  const profile: AgentProfileSummary | undefined = resolveChatProfile(
    available,
    requestedId,
  );
  const profileId = profile?.id;

  const [phase, setPhase] = useState<Phase>({ status: "connecting" });
  const [transcript, setTranscript] = useState<Transcript>(emptyTranscript);
  // A local seq, not `toolCallId`: nothing stops an agent asking twice about
  // the same tool call, and two rows must never share a React key.
  const [permissions, setPermissions] = useState<PendingPermission[]>([]);
  const permissionSeq = useRef(0);
  // Auto Accept (Dave's call, ported from Paseo): answers every permission
  // request itself instead of showing it. Off by default, and per-session —
  // deliberately not persisted the way `configOptionValues` is, so a
  // reconnect never silently carries a "stop asking me" choice forward. A
  // ref because `onPermission` below is wired once per connect, not
  // per-render, and needs the *current* value at request time.
  const [autoAccept, setAutoAccept] = useState(false);
  const autoAcceptRef = useRef(autoAccept);
  autoAcceptRef.current = autoAccept;
  const [agentName, setAgentName] = useState<string | undefined>();
  // The connected session's `AgentInfo.id`. Held in state (not just the handle
  // ref) because it is what the tab-chrome and title effects key on.
  const [sessionId, setSessionId] = useState<string | undefined>();
  // How this connection came to be (RFC 0042) — `"journal-only"` is the one
  // value that changes what the composer offers. Snapshotted once per
  // connect(); the panel doesn't need to react to it changing afterward.
  const [resumeOutcome, setResumeOutcome] =
    useState<AgentSessionHandle["resumeOutcome"]>("new");
  // Why the next reconnect is happening — set by "Continue in a new session"
  // or by Clear (RFC 0048) just before bumping `nonce`, read and cleared at
  // the top of the connect attempt it triggers. A ref, not state: it must be
  // visible to that very effect run, with no extra render. `null` for a
  // remount or "Reconnect", which take the normal resume → load → journal
  // path.
  const restartIntentRef = useRef<{
    intent: RestartIntent;
    sessionId: string;
  } | null>(null);
  const [draft, setDraft] = useState("");
  // ↑/↓ prompt history state, and the last Escape's timestamp for the
  // double-tap-to-clear gesture — a ref, since a timestamp on its own
  // doesn't need to trigger a render the way `historyNav` does.
  const [historyNav, setHistoryNav] = useState<HistoryNavState>(
    NOT_NAVIGATING_HISTORY,
  );
  const lastEscapeAtRef = useRef(0);
  const [paletteIndex, setPaletteIndex] = useState(0);
  const [paletteDismissed, setPaletteDismissed] = useState(false);
  const [busy, setBusy] = useState(false);
  // The turn footer's "Worked for …" (RFC 0043 finding 1) — timing lives here,
  // not in `transcript-model.ts`, because a turn's start/end isn't part of the
  // wire protocol or the journal; it's only ever what this panel measured
  // itself. Keyed by the user message's own entry key (predicted via
  // `nextEntryKey` before `send()` appends it) rather than a turn index, so a
  // duration survives entries being re-grouped and never points at the wrong
  // turn. A turn with no entry here (a journal-restored one, or the very
  // first render of a still-running one) simply shows no footer.
  const [turnDurations, setTurnDurations] = useState<
    Readonly<Record<string, number>>
  >({});
  const turnStartRef = useRef<{ key: string; startedAt: number } | null>(null);
  // The agent process dying is not a separate channel — it lands on this
  // session's own `AgentInfo` as `activity: "error"`, exactly as it would for
  // a Terminal session. Reading it back through `ctx.agents` rather than
  // through a bespoke handle event is the observation-parity promise in
  // action, and it means the composer stops offering to send into a dead pipe.
  const [lost, setLost] = useState(false);
  // Whatever session controls the agent advertised (Cursor: mode + model;
  // Claude: permission mode only). Kept in sync with the handle — a mode the
  // agent moves itself lands here too.
  const [configOptions, setConfigOptions] = useState<
    readonly AgentSessionConfigOption[]
  >([]);
  // Snapshot every advertised control's current value into `params` (see
  // `AcpChatPanelParams.configOptionValues`) whenever it changes — the
  // user's own pick, or the agent moving one itself. Skipped while empty
  // (connecting, or between sessions) so a reconnect never overwrites the
  // choice it is trying to restore with nothing.
  useEffect(() => {
    if (configOptions.length === 0) return;
    const values: Record<string, string> = {};
    for (const opt of configOptions) values[opt.id] = opt.currentValue;
    api.updateParameters({ configOptionValues: values });
  }, [api, configOptions]);
  // The agent's slash commands (and, unmarked, its skills — RFC 0040): a live
  // snapshot backing the composer's `/` palette. Empty until the agent's
  // first `available_commands_update`, which is not guaranteed to ever come.
  const [commands, setCommands] = useState<readonly AgentCommand[]>([]);
  // Files staged for the next turn, sent as `resource_link` prompt blocks.
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  // Which tool rows are expanded (a tweak on top of RFC 0043) — collapsed by
  // default, toggled by clicking the row. Keyed by the entry's own key, not
  // `toolCallId`, matching how the transcript already keys everything else.
  const [expandedTools, setExpandedTools] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const toggleTool = useCallback((key: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);
  // Config options the agent advertised but then rejected a write for. An
  // advertisement is not a guarantee: `claude-agent-acp` lists a `fast` entry
  // its own handler answers `-32603 Unknown config option: fast` for. Once a
  // control is known not to work, stop offering it rather than leaving a
  // Select that only ever errors.
  const [deadConfigIds, setDeadConfigIds] = useState<ReadonlySet<string>>(
    () => new Set(),
  );

  const handleRef = useRef<AgentSessionHandle | null>(null);
  // `reveal` is invoked long after the connect() that registered it, so it
  // reads the panel API through a ref rather than closing over one render's.
  const apiRef = useRef(api);
  apiRef.current = api;

  // Paint the transcript journal (RFC 0042) *before* connecting — a restored
  // panel shows its prior conversation immediately, independent of however
  // long `session/resume` / `session/load` takes. The connect effect below
  // paints its own (possibly more current — a `load`'s own replay lands
  // through it) copy of `handle.journal` once it resolves; this is only the
  // instant-paint half.
  useEffect(() => {
    if (!params.sessionId) return;
    let cancelled = false;
    void ctx.agents.sessions.readJournal(params.sessionId).then((journal) => {
      if (!cancelled) setTranscript(seedFromJournal(journal));
    });
    return () => {
      cancelled = true;
    };
    // Also re-runs on `nonce` (Reconnect / Continue in a new session), so a
    // manual reconnect gets the same instant paint a cold restart does.
    // Deliberately **not** keyed on the rest of the connect effect's
    // dependencies — this must run from whatever `params.sessionId` is right
    // now, before any connect() has had a chance to move it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ctx, params.sessionId, nonce]);

  // --- the connection ------------------------------------------------------
  // Keyed on the profile: switching agents is a **teardown**, not a prop
  // change. The old process is reaped, the transcript is dropped, and a fresh
  // session is connected — the two conversations have nothing in common.
  useEffect(() => {
    if (!profileId) {
      setPhase({ status: "no-profile" });
      return;
    }
    let cancelled = false;
    const abortController = new AbortController();
    const subs: Disposable[] = [];
    // "Continue in a new session" (RFC 0042) and Clear (RFC 0048) set this
    // just before bumping `nonce` to force this reconnect past resume/load
    // and straight to a fresh `session/new` — carrying the journal for the
    // first, discarding it for the second. Consumed once: a later reconnect
    // (a crash, "Reconnect") goes through the normal resume → load → journal
    // flow again.
    const restart = restartIntentRef.current;
    restartIntentRef.current = null;
    setPhase({ status: "connecting" });
    setTranscript(emptyTranscript);
    setPermissions([]);
    setAgentName(undefined);
    setSessionId(undefined);
    setResumeOutcome("new");
    // A profile switch mid-turn abandons that turn's `prompt()` promise, whose
    // `finally` sees a different handle and leaves `busy` alone — so clear it
    // here or the composer keeps offering Stop for a session that is gone.
    setBusy(false);
    setLost(false);
    setConfigOptions([]);
    setDeadConfigIds(new Set());
    setAttachments([]);
    setCommands([]);
    setTurnDurations({});
    turnStartRef.current = null;
    setExpandedTools(new Set());

    // Restore a persisted session (RFC 0042 `ChatPanelState`) — `undefined`
    // for a brand-new panel, which is an ordinary `session/new`.
    // The restart's own id wins over the persisted one: a panel that has
    // connected but not yet written its `DockPanelRecord` still has a live
    // session (and a journal) to continue or clear.
    const restoreSessionId = restart?.sessionId ?? params.sessionId;
    const resume = restoreOptionFor(restoreSessionId, restart?.intent ?? null);

    void ctx.agents.sessions
      .connect(profileId, {
        cwd,
        resume,
        // This panel's own workspace, never "whichever one is active": a
        // background workspace's dock stays mounted, so a session connecting
        // (or reconnecting) while the user is elsewhere would otherwise be
        // filed under the workspace they are standing in — and would move
        // again on the next restart, when it is restored from its panel's
        // record. Caught by the restart-fidelity suite, 2026-09-10.
        ...(workspaceId ? { workspaceId } : {}),
        // The last title this session showed, painted immediately while
        // reconnecting (RFC 0042) — `initialize` alone can take several
        // seconds, and without this the tab, workspace row, and Agents
        // navigator all sit on the plain profile label until it resolves,
        // even though the agent's own title from before the app closed was
        // already known.
        title: params.title,
        // `ctx.agents.reveal(id)` — from the Agents navigator, a command, a
        // notification — activates the workspace and then calls this, so a
        // kind-agnostic caller focuses this transcript without knowing it is
        // one.
        reveal: () => apiRef.current.setActive(),
        // Lets the effect cleanup abort a connect that is still in the
        // multi-step handshake (initialize → session/new or session/resume).
        // Without this, re-running the effect mid-handshake (nonce bump,
        // profile switch, unmount) leaves the spawned backend alive with no
        // owner — the root cause of the ACP backend accumulation bug.
        signal: abortController.signal,
      })
      .then((handle) => {
        // A profile switch (or a closed panel) that lands mid-handshake still
        // owes the agent process a kill — otherwise it orphans.
        if (cancelled) {
          handle.dispose();
          return;
        }
        handleRef.current = handle;
        // Paint prior turns before subscribing to live ones — the journal
        // (RFC 0042), whether from a `resume` reconnect (no replay: this is
        // the only record) or a `"journal-only"` degraded session.
        setTranscript(seedFromJournal(handle.journal));
        subs.push(
          handle.onUpdate((update) =>
            setTranscript((t) => applyUpdate(t, update)),
          ),
        );
        subs.push(
          handle.onPermission((request) => {
            if (autoAcceptRef.current) {
              const optionId = autoAcceptOptionId(request.options);
              if (optionId !== undefined) {
                request.respond(optionId);
                return;
              }
              // A genuine chooser (or no allow option at all) — nothing
              // safe to guess, so it still surfaces below like normal.
            }
            setPermissions((prev) => [
              ...prev,
              { key: `p${++permissionSeq.current}`, request },
            ]);
          }),
        );
        setAgentName(handle.agentName);
        setSessionId(handle.id);
        setResumeOutcome(handle.resumeOutcome);
        setConfigOptions(handle.configOptions);
        subs.push(
          handle.onConfigOptionsChanged(() =>
            setConfigOptions(handle.configOptions),
          ),
        );
        // Reassert this tab's last-known config choices — a resumed session
        // is a *new* agent process with no memory of the mode/model the old
        // one was left on (see `AcpChatPanelParams.configOptionValues`).
        // Only for a value the fresh session still actually offers; an
        // agent that rejects it lands in `deadConfigIds`, same as a live
        // pick that fails.
        const desiredConfig = params.configOptionValues;
        if (desiredConfig) {
          for (const opt of handle.configOptions) {
            const want = desiredConfig[opt.id];
            if (
              want !== undefined &&
              want !== opt.currentValue &&
              opt.options.some((c) => c.value === want)
            ) {
              handle.setConfigOption(opt.id, want).catch(() => {
                setDeadConfigIds((prev) => new Set(prev).add(opt.id));
              });
            }
          }
        }
        setCommands(handle.commands);
        subs.push(handle.onCommandsChanged(() => setCommands(handle.commands)));
        // Persist the identity to restore next time — keyed on the handle's
        // own `sessionId`, which may not be what was asked for (`session/load`
        // adopting a fresh id; a `startFresh` continuation deliberately
        // keeping the original — see `session-restore.ts`).
        apiRef.current.updateParameters(
          panelStateAfterConnect(profileId, handle, cwd),
        );
        setPhase({ status: "ready" });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setPhase({ status: "error", message: errorMessage(err) });
      });

    return () => {
      cancelled = true;
      // Abort any in-flight handshake (initialize → session/new or
      // session/resume). Must fire before handle?.dispose() so the service
      // can kill the process even when connect() hasn't resolved yet and
      // handleRef.current is still null.
      abortController.abort();
      for (const sub of subs) sub.dispose();
      const handle = handleRef.current;
      handleRef.current = null;
      // Reap the process for a successfully-connected session (the abort
      // above covers the in-flight case; this covers the already-resolved one).
      handle?.dispose();
    };
    // Deliberately **not** keyed on `params.sessionId`: this effect is what
    // writes it (via `updateParameters` above), and re-running on every write
    // would tear a freshly-connected session down to reconnect it right back.
    // `nonce` covers every case where a reconnect using the *current*
    // `params.sessionId` is wanted (Reconnect, Continue in a new session).
    // `workspaceId` never changes for a mounted panel — a panel does not move
    // workspaces — so it costs nothing here and keeps the lint rule honest.
  }, [ctx, profileId, cwd, nonce, workspaceId]);

  // ## The panel is a subject of agent chrome, not an author of it
  //
  // One declaration — `api.setAgentSession(id)` — tells the host what this tab
  // is showing, and everything that used to be hand-rolled here follows from
  // it: the activity badge and the brand icon are painted by whoever observes
  // `ctx.agents` (`silo.agents`, or a replacement), which is also what makes
  // them honour that extension's icon-mode and focus-behaviour settings; and
  // the host can tell whether the user is looking at this session, so it never
  // raises attention for a finish they watched. The panel used to acknowledge
  // itself on becoming visible, which was a consumer reimplementing a host
  // rule from the outside.
  //
  // Its *contents* stay its own — that is what `ctx.agents.sessions` is for.
  // Its tab chrome is not its business.
  useEffect(() => {
    if (!sessionId) return;
    api.setAgentSession(sessionId);
    return () => api.setAgentSession(null);
  }, [api, sessionId]);

  // The cwd line in the host-drawn strip (RFC 0039). Same fact the panel used
  // to hand a `<Breadcrumb>` it imported; now it states it and the dock frame
  // draws it.
  useEffect(() => {
    api.setBreadcrumb(
      cwd ? { filePath: cwd, workspaceFolder: cwd, leafIcon: "folder" } : null,
    );
    return () => api.setBreadcrumb(null);
  }, [api, cwd]);

  // The tab label is `AgentInfo.title` — host-computed, so the dock tab, the
  // workspace status row and the navigator row are the same string from the
  // same source. `params.title` is only a **seed** for before the session
  // exists: whoever opened the panel (the `+` menu's profile list,
  // `core.newAgent.<id>`) supplies the profile's label so the tab is never
  // briefly nameless.
  //
  // The agent process dying is not a separate channel either — it lands on
  // this same `AgentInfo` as `activity: "error"`, so `lost` reads off the one
  // snapshot and the composer stops offering to send into a dead pipe.
  useEffect(() => {
    const read = (all: readonly AgentInfo[]) => {
      const info = sessionId ? all.find((a) => a.id === sessionId) : undefined;
      setLost(info?.activity === "error");
      api.setTitle(info?.title ?? params.title ?? profile?.label ?? "Agent");
      // Keep `DockPanelState` current with whatever this session's *live*
      // identity is, so the next restart's placeholder (RFC 0042 — painted
      // before `connect()`'s handshake even resolves) shows the real thing
      // instead of the plain profile label. Two independent facts can each
      // have moved: the agent's own volunteered title (a
      // `session_info_update` — never persisted before this, so it never
      // survived a restart even though it stuck around for the rest of the
      // live session), and the id itself (an in-place `ctx.agents.resume(id)`
      // — a reconnect that doesn't remount this panel, e.g. from the Agents
      // navigator — can adopt a new `session/load` id after this handle was
      // returned).
      const patch: {
        profileId?: string;
        sessionId?: string;
        cwd?: string;
        title?: string;
      } = {};
      if (info?.title && info.title !== params.title) patch.title = info.title;
      if (info?.sessionId && profileId && info.sessionId !== params.sessionId) {
        patch.profileId = profileId;
        patch.sessionId = info.sessionId;
        patch.cwd = cwd;
      }
      if (Object.keys(patch).length > 0) api.updateParameters(patch);
    };
    const sub = ctx.agents.subscribe(read, { allWorkspaces: true });
    read(ctx.agents.getState({ allWorkspaces: true }));
    return () => sub.dispose();
  }, [
    ctx,
    api,
    sessionId,
    params.title,
    params.sessionId,
    profile?.label,
    profileId,
    cwd,
  ]);

  /**
   * **Clear** — the session reset (RFC 0048), behind ⌘⇧K, the transcript
   * context menu, and a typed `/clear` alike. Ends this session, starts a new
   * one on the same profile and folder, and discards the transcript journal
   * the old one was writing.
   *
   * Nothing is repainted here: the reconnect effect below already resets the
   * transcript, permissions, commands, config options, attachments and turn
   * state on every run, so bumping `nonce` *is* the empty transcript. A
   * panel-local `setTranscript(emptyTranscript)` would only blank the view
   * while the agent and the journal remembered everything — which is the
   * behavior this replaced.
   */
  // Whether there is a session to reset at all — the same test `resetSession`
  // makes, hoisted so the menu row and the shortcut can stay quiet without it.
  const canReset = Boolean(params.sessionId ?? sessionId);

  const resetSession = useCallback(() => {
    // The persisted id first, the live one as the fallback for a session that
    // has connected but whose panel record has not been written yet. With
    // neither there is no journal and no agent context to clear, so a reset
    // would just be a reconnect.
    const target = params.sessionId ?? sessionId;
    if (!target) return;
    restartIntentRef.current = { intent: "reset", sessionId: target };
    setNonce((n) => n + 1);
  }, [params.sessionId, sessionId]);

  /**
   * The gesture behind every Clear Session entry point: confirm, then reset.
   *
   * The confirmation is the *entry point's* job, not `resetSession`'s — the
   * reconnect effect must be able to run a reset it has already been told to
   * do without asking again. Every gesture goes through here (⌘⇧K, the menu
   * row, and a typed `/clear` alike) so "do I get asked?" never depends on
   * which one the user reached for, the same reason R1 gave them one reset
   * path in the first place.
   *
   * Skipping the dialog is a persisted preference, not a modifier: it is set
   * from the dialog's own "Don't ask again" box and turned back on at
   * Settings → Agents → Chat, so it is never a one-way door.
   */
  const requestReset = useCallback(async (): Promise<boolean> => {
    if (!canReset) return false;
    if (!chatPanelSettingsService.getState().confirmBeforeClear) {
      resetSession();
      return true;
    }
    const choice = await ctx.ui.showModal<ClearSessionChoice | undefined>(
      (close) => (
        <ClearSessionDialog
          journalIsOnlyCopy={isReadOnly(resumeOutcome)}
          close={close}
        />
      ),
      {
        title: "Clear session?",
        size: "sm",
        dismissible: true,
        ariaLabel: "Clear session?",
      },
    );
    if (!choice) return false;
    if (choice.dontAskAgain) {
      chatPanelSettingsService.set({ confirmBeforeClear: false });
    }
    resetSession();
    return true;
  }, [canReset, ctx, resetSession, resumeOutcome]);

  // --- sending -------------------------------------------------------------
  const send = useCallback(async () => {
    const handle = handleRef.current;
    const text = draft.trim();
    const files = attachments;
    // `/clear` is reserved (RFC 0048): Silo answers it with a session
    // reset and the agent never sees it, so what the user typed matches what
    // happens whichever agent is connected — and the journal goes with the
    // agent's context, which an agent's own `/clear` leaves behind. The
    // precedence — a reset outranks the send guard rather than sitting
    // behind it — lives in `composerSubmitAction`, so the typed entry point
    // reaches the same `resetSession()` on the same `canReset` gate as ⌘⇧K
    // and the tab menu (R1: one implementation of clear).
    const action = composerSubmitAction({
      draft,
      reserved: isReservedDraft(text),
      canReset,
      hasHandle: Boolean(handle),
      busy,
      ready: phase.status === "ready",
      lost,
      attachmentCount: files.length,
    });
    if (action === "none") return;
    if (action === "reset") {
      // The draft is cleared only once the reset is confirmed — cancelling
      // leaves the typed `/clear` in the composer to edit or re-send, rather
      // than swallowing it on the user's behalf.
      const confirmed = await requestReset();
      if (!confirmed) return;
      setDraft("");
      setHistoryNav(NOT_NAVIGATING_HISTORY);
      setAttachments([]);
      return;
    }
    // Narrowing only — `action === "send"` already implies `hasHandle`.
    if (!handle) return;
    setDraft("");
    setHistoryNav(NOT_NAVIGATING_HISTORY);
    setAttachments([]);
    // Predicted before the append below runs (RFC 0043 finding 1) — this
    // turn's footer is keyed to the user message's own entry key.
    turnStartRef.current = {
      key: nextEntryKey(transcript),
      startedAt: Date.now(),
    };
    setTranscript((t) =>
      appendUserMessage(
        t,
        text,
        files.map((f) => f.name),
      ),
    );
    setBusy(true);
    const blocks: AgentPromptBlock[] = [
      ...files.map(
        (f): AgentPromptBlock => ({
          type: "resource_link",
          uri: f.uri,
          name: f.name,
        }),
      ),
      ...(text ? [{ type: "text" as const, text }] : []),
    ];
    try {
      const { stopReason } = await handle.prompt(blocks);
      const notice = stopReasonNotice(stopReason);
      if (notice) {
        setTranscript((t) => appendNotice(t, notice.tone, notice.text));
      }
    } catch (err) {
      setTranscript((t) => appendNotice(t, "error", errorMessage(err)));
    } finally {
      // The panel may have been torn down mid-turn; the state setters are
      // no-ops then, but `busy` must not be left stuck for a live one.
      if (handleRef.current === handle) setBusy(false);
      // Whatever ended the turn — success, an error like the upstream
      // connection dropping while a permission request sat unanswered, or a
      // cancel — any tool call still mid-flight gets no final update from a
      // dead stream, and any permission request from it can no longer be
      // answered into anything. Only one turn runs at a time, so both are
      // unconditionally this turn's own leftovers, not a later one's.
      setTranscript((t) => closeDanglingTools(t));
      setPermissions([]);
      const started = turnStartRef.current;
      if (started) {
        const durationMs = Date.now() - started.startedAt;
        setTurnDurations((prev) => ({ ...prev, [started.key]: durationMs }));
        turnStartRef.current = null;
      }
    }
  }, [
    draft,
    busy,
    attachments,
    transcript,
    phase.status,
    lost,
    canReset,
    requestReset,
  ]);

  const answer = useCallback((pending: PendingPermission, optionId: string) => {
    pending.request.respond(optionId);
    setPermissions((prev) => prev.filter((p) => p !== pending));
  }, []);

  const stageAttachments = useCallback((incoming: readonly Attachment[]) => {
    setAttachments((prev) => addAttachments(prev, incoming));
  }, []);

  const attachFile = useCallback(async () => {
    const picked = await ctx.ui.pickFile({ defaultPath: cwd || undefined });
    if (!picked) return;
    stageAttachments([toAttachment(picked)]);
  }, [ctx, cwd, stageAttachments]);

  const pickCommand = useCallback((command: AgentCommand) => {
    const next = draftAfterCommandPick(command);
    setDraft(next);
    setPaletteDismissed(false);
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(next.length, next.length);
    });
  }, []);

  // Switching the profile is a teardown — the agent is reaped and the
  // transcript dropped (see the connect effect). A menu pick in a composer
  // does not look like that, so anything worth losing gets a confirmation
  // first; `confirmProfileSwitch` owns the rule and returns `null` when the
  // switch is free. Declining touches no state, and the profile MenuButton's
  // label is derived from `profileId` on every render, so it snaps back to
  // the live agent on its own.
  const switchProfile = useCallback(
    async (nextId: string) => {
      if (nextId === profileId) return;
      const ask = confirmProfileSwitch(
        transcript,
        busy,
        profile?.label ?? agentName ?? "The agent",
      );
      if (ask && !(await ctx.ui.confirm(ask))) return;
      // The tab remembers the choice, so reopening it comes back on the same
      // agent. The effect above does the teardown. `sessionId` is cleared,
      // not carried over — a session belongs to the agent that created it,
      // and resuming an unrelated one under a different profile is not a
      // thing `session/resume` / `session/load` are defined for.
      setRequestedId(nextId);
      api.updateParameters({
        profileId: nextId,
        sessionId: null,
        // The new agent's transcript is empty; it should follow its own stream
        // rather than inherit an offset measured against the old one.
        scrollTop: 0,
        scrollPinned: true,
      });
    },
    [ctx, api, profileId, transcript, busy, agentName, profile?.label],
  );

  const setConfigOption = useCallback((id: string, value: string) => {
    handleRef.current?.setConfigOption(id, value).catch((err) => {
      setTranscript((t) => appendNotice(t, "error", errorMessage(err)));
      // The agent advertised this control but will not accept a write for it
      // — drop it so the user is not left poking a control that only errors.
      setDeadConfigIds((prev) => new Set(prev).add(id));
    });
  }, []);

  // `resumeOutcome === "journal-only"` (RFC 0042): the agent could resume
  // neither over `session/resume` nor `session/load`. There is no live
  // session to prompt — the transcript above is the journal alone — so the
  // composer offers one thing: start a new one, same panel and profile,
  // continuing the same journal. The connect effect's own
  // `panelStateAfterConnect` call persists whatever *new* id that connect
  // gets — never the one already known to be unresumable.
  const readOnly = isReadOnly(resumeOutcome);
  const inputEnabled = composerInputEnabled(lost, readOnly);

  const pasteClipboardFiles = useCallback(
    async (files: File[]) => {
      try {
        const dir = await ctx.storage.workspaceDir(workspaceId);
        const stamp = Date.now();
        const incoming: Attachment[] = [];
        for (let i = 0; i < files.length; i++) {
          const file = files[i];
          if (!file) continue;
          const name = pastedFileName(file.name, file.type);
          const dest = pastedFilePath(dir, name, stamp + i);
          await ctx.files.writeBytes(dest, await file.arrayBuffer());
          incoming.push(toAttachment(dest));
        }
        stageAttachments(incoming);
      } catch (err) {
        setTranscript((t) => appendNotice(t, "error", errorMessage(err)));
      }
    },
    [ctx, workspaceId, stageAttachments],
  );

  const onComposerPaste = useCallback(
    (e: ClipboardEvent<HTMLTextAreaElement>) => {
      if (!inputEnabled) return;
      const data = e.clipboardData;
      if (!data) return;
      const files = filesFromDataTransfer(data);
      const classified = classifyClipboardPaste({
        getData: (type) => data.getData(type),
        fileCount: files.length,
      });
      if (classified.kind === "none") return;
      e.preventDefault();
      if (classified.kind === "paths") {
        stageAttachments(classified.paths.map(toAttachment));
        return;
      }
      void pasteClipboardFiles(files);
    },
    [inputEnabled, stageAttachments, pasteClipboardFiles],
  );
  const canSend = composerCanSend({
    ready: phase.status === "ready",
    lost,
    draft,
    attachmentCount: attachments.length,
  });
  const connecting = composerShowConnecting(phase.status);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Grows the composer with the draft, up to a cap — before paint, so there
  // is never a flash of the wrong height. Resetting to "auto" first is what
  // lets it *shrink* back down too (e.g. on Send clearing the draft):
  // `scrollHeight` only ever reports a size at least as tall as whatever
  // height is already set, so skipping the reset would ratchet upward only.
  // Skipped while backgrounded: a hidden dock tab (`display: none`) reports
  // `scrollHeight` 0, which would collapse the textarea (e.g. on a hot
  // reload that re-runs this effect for every mounted panel, not just the
  // active one) — `onScreen` in the deps re-measures correctly once this
  // panel is shown again.
  useLayoutEffect(() => {
    if (!onScreen) return;
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${composerTextareaHeightPx(el.scrollHeight)}px`;
  }, [draft, onScreen]);

  // Entry focus: the composer is the one thing this panel has to type into, so
  // it takes the caret whenever the user enters the panel — on activation and
  // on a click of an already-active tab alike. The hook owns both signals and
  // the guarded frame retry that wins dockview's focus shuffle (RFC 0049); a
  // disabled composer makes `focus()` a no-op, so a lost/read-only session
  // needs no extra guard here.
  const focusComposer = usePanelEntryFocus(api, {
    focus: () => inputRef.current?.focus(),
    isFocused: () => document.activeElement === inputRef.current,
  });

  // The moment the composer accepts input is neither a mount nor an
  // activation, so it's the one entry point the hook can't see: drive it
  // imperatively. Fires on create — the input is enabled during connect, so
  // you can draft before the agent is live — and again if a read-only or lost
  // session becomes writable.
  useEffect(() => {
    if (inputEnabled) focusComposer();
  }, [inputEnabled, focusComposer]);

  const continueInNewSession = useCallback(() => {
    const target = params.sessionId ?? sessionId;
    if (!target) return;
    restartIntentRef.current = { intent: "continue-fresh", sessionId: target };
    setNonce((n) => n + 1);
  }, [params.sessionId, sessionId]);

  // The `/` command palette (RFC 0040) — a filtered list on `session.commands`
  // while the draft is authoring a command name, no raw read. `commandQuery`
  // is `undefined` once a space follows the `/` (the user is now typing the
  // argument), which also closes the palette.
  const commandQuery = commandQueryFromDraft(draft);
  const paletteCommands =
    commandQuery !== undefined
      ? filterCommands(withReservedCommands(commands), commandQuery)
      : [];
  const showPalette =
    paletteCommands.length > 0 &&
    !paletteDismissed &&
    phase.status === "ready" &&
    !lost &&
    !readOnly;
  // Hide the Auto Accept toggle whenever the agent already advertises its
  // own full-bypass mode (Claude's) — see `agentHasBypassMode`.
  const showAutoAccept = !agentHasBypassMode(configOptions);
  const activePaletteIndex = clampPaletteIndex(
    paletteIndex,
    paletteCommands.length,
  );
  const paletteKey = paletteCommands.map((c) => c.name).join("\0");

  useEffect(() => {
    setPaletteIndex(0);
  }, [paletteKey]);

  useEffect(() => {
    setPaletteDismissed(false);
  }, [commandQuery]);

  const paletteRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!showPalette) return;
    paletteRef.current
      ?.querySelector<HTMLElement>('[data-selected="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [showPalette, activePaletteIndex]);

  // --- transcript scroll ---------------------------------------------------
  // **This panel mounts once and stays mounted for as long as its tab exists.**
  // dockview renders React panels through a portal into a `<div>` it owns, and
  // deselecting a tab only *detaches* that div: with the default
  // `renderer: "onlyWhenVisible"`, `ContentContainer.renderPanel` does
  // `removeChild` on the outgoing panel and `appendChild` on the incoming one
  // — never a teardown, so the portal (and every ref and piece of state
  // below) survives untouched. Backgrounding a workspace doesn't even do that;
  // its dock stays in the tree behind `visibility: hidden`.
  //
  // So there is no remount for a restore to hang off. That is what sank both
  // earlier attempts at this feature: the restore effect ran exactly once, at
  // panel creation, when there was nothing to restore. What actually goes
  // wrong is narrower — **detaching an element from the document discards its
  // `scrollTop`** — so the transcript comes back at 0 with all of its React
  // state still perfectly intact.
  //
  // Two rules follow, and they are the whole design:
  //
  // 1. Re-assert the remembered position on every transition back **on
  //    screen** — `onScreen` (`DockPanelProps`), which the host resolves from
  //    both the tab and the workspace. Neither transition is a mount, and
  //    either can be the one that lost the offset.
  // 2. Learn the position **only from live scroll events on an on-screen
  //    scroller**. dockview detaches the element *before* it reports the
  //    change, so anything read from the DOM once it is off screen is 0 —
  //    reading it there is how the saved position got overwritten with 0.
  //
  // Two stores, and no third: `liveScrollRef` holds the current position (a
  // ref is enough precisely because the panel outlives every switch), and
  // `params.scrollTop` / `params.scrollPinned` in this panel's own
  // `DockPanelRecord` (RFC 0041) carry it across a close-and-reopen or a
  // restart, written on a debounce and flushed when the panel leaves screen.
  const scrollBucket = transcriptScrollKey(
    profileId,
    sessionId ?? params.sessionId,
  );

  const scrollerRef = useRef<HTMLDivElement | null>(null);

  // Whether the transcript's rows are in the DOM. See the long comment at the
  // render site for *why* they are dropped; this is the *when*.
  //
  // Not simply `onScreen`. Dropping the rows the instant a panel leaves screen
  // and rebuilding them on return costs ~1.4 s of main thread per switch
  // against a real 14,826-node transcript, versus ~0.44 s for leaving them
  // mounted — measured 2026-09-17, four warmed workspaces. Trading a ~3× worse
  // workspace switch for a smaller render tree is a bad deal in the one app
  // whose premise is instant switching.
  //
  // The cost only lands on a workspace you come *back to* soon, so the rows
  // survive a grace period. Bouncing between two or three workspaces stays
  // free; a workspace left alone for longer is released and stops contributing
  // to the document's render tree. That is where the multiplier actually comes
  // from — the six workspaces you have not looked at in minutes, not the one
  // you just left.
  // Rules and rationale in `transcript-mount.ts`. Two things matter here:
  // neither `idleDropped` nor `headRevealed` is consulted directly — what
  // renders is **derived during render** by `transcriptWindow`, because an
  // effect runs after paint and storing the decision flashed one empty frame
  // on every return to a dropped panel.
  const [idleDropped, setIdleDropped] = useState(false);
  const [headRevealed, setHeadRevealed] = useState(true);
  // Height of everything above the tail, measured while on screen. Kept in a
  // ref rather than measured at drop time: by then the panel may be a
  // `display: none` tab, where every offset reads 0.
  const headSpanRef = useRef<number | null>(null);
  const [spacerPx, setSpacerPx] = useState<number | null>(null);

  // Swapping the spacer for the real head changes the content's height by
  // however wrong the measurement was. Recording the height before the swap
  // lets the layout effect below nudge `scrollTop` by exactly that error, so
  // what the user was reading stays put instead of jumping.
  const pendingRevealRef = useRef<number | null>(null);
  const revealHead = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    pendingRevealRef.current = el.scrollHeight;
    setHeadRevealed(true);
  }, []);
  // Its own listener rather than a branch inside `onScroll`. That handler
  // exists to *learn* a position and is guarded accordingly — it bails while a
  // restore is in flight and ignores anything that looks like a clamp, which is
  // exactly what a jump to the top looks like. Revealing the head is unrelated
  // to learning a position and must not inherit those guards.
  useEffect(() => {
    if (headRevealed || !onScreen || spacerPx === null) return;
    const el = scrollerRef.current;
    if (!el) return;
    const check = () => {
      if (shouldRevealHead({ scrollTop: el.scrollTop, spacerPx })) revealHead();
    };
    el.addEventListener("scroll", check, { passive: true });
    // The scroll restore fires a scroll event of its own, which `check` picks
    // up. This backstop covers the case where it does not have to move the
    // scroller at all — without it the panel would sit showing the spacer's
    // blank space until the user happened to scroll.
    const settle = setTimeout(check, HEAD_REVEAL_SETTLE_MS);
    return () => {
      clearTimeout(settle);
      el.removeEventListener("scroll", check);
    };
  }, [headRevealed, onScreen, spacerPx, revealHead]);

  useLayoutEffect(() => {
    if (!headRevealed) return;
    const before = pendingRevealRef.current;
    pendingRevealRef.current = null;
    const el = scrollerRef.current;
    if (before === null || !el) return;
    const delta = revealScrollAdjustment({
      scrollHeightBefore: before,
      scrollHeightAfter: el.scrollHeight,
    });
    if (delta !== 0) el.scrollTop += delta;
  }, [headRevealed]);
  useEffect(() => {
    const plan = planIdleDrop({ onScreen });
    if (plan.kind === "cancel") {
      setIdleDropped(false);
      return;
    }
    const t = setTimeout(() => {
      setIdleDropped(true);
      // Coming back should cost the tail, not the whole transcript. Only hide
      // the head if we have a believable height to stand in for it.
      const span = headSpanRef.current;
      if (span !== null && span > 0) {
        setSpacerPx(span);
        setHeadRevealed(false);
      }
    }, plan.delayMs);
    return () => clearTimeout(t);
  }, [onScreen]);

  // Shift-held file drops stage the file as an attachment — the same landing
  // spot a pasted path already takes via `classifyClipboardPaste`'s "paths"
  // case above. Plain (copy-mode) drops fall through to dockview, which opens
  // the file as a new editor pane. Capture phase keeps the event off
  // dockview's bubble-phase drop handler, matching the terminal and editor
  // panels' own drop targets.
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = rootRef.current;
    if (!node) return;
    const reg = ctx.dnd.registerDropTarget(node, {
      accepts: [DND_MIME.filePath],
      capture: true,
      onDrop({ mode, items }) {
        if (!inputEnabled || mode !== "paste") return;
        const paths = items
          .filter((i) => i.mime === DND_MIME.filePath)
          .map((i) => i.value);
        if (!paths.length) return;
        stageAttachments(paths.map(toAttachment));
        return true; // handled — host preventDefault + stopPropagation
      },
    });
    return () => reg.dispose();
  }, [ctx, inputEnabled, stageAttachments]);

  const onScreenRef = useRef(onScreen);
  onScreenRef.current = onScreen;
  // The live position, and the conversation it was measured in. Reset rather
  // than reused when the bucket changes — an offset from the previous agent's
  // transcript is meaningless in the new one.
  const liveScrollRef = useRef<ScrollSnapshot | null>(null);
  const liveScrollBucketRef = useRef(scrollBucket);
  if (liveScrollBucketRef.current !== scrollBucket) {
    liveScrollBucketRef.current = scrollBucket;
    liveScrollRef.current = null;
  }
  // Mirrors `liveScrollRef.current?.pinned` into render — a ref alone can't
  // drive the "jump to latest" button's visibility. Starts `true` so a fresh
  // or still-restoring panel never flashes the button before it knows better.
  const [pinnedToBottom, setPinnedToBottom] = useState(true);
  const restoreDoneRef = useRef(false);
  const scrollSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // What was last written into `params`, so a flush or a debounce that lands
  // on an unchanged position doesn't churn the panel record — and re-render
  // the whole dock — for nothing.
  const writtenScrollRef = useRef<ScrollSnapshot | null>(null);
  // When the transcript last changed shape, and whether it has painted
  // anything at all — the two inputs `shouldAbandonRestore` needs, read from
  // inside the retry loop rather than passed through its dependencies.
  const lastTranscriptChangeRef = useRef(Date.now());
  const hasEntriesRef = useRef(false);
  hasEntriesRef.current = transcript.entries.length > 0;
  // `params` as of this render, read by the restore driver without becoming
  // one of its dependencies — see the comment there.
  const paramsRef = useRef(params);
  paramsRef.current = params;

  const writeScrollParams = useCallback(
    (snap: ScrollSnapshot | null) => {
      if (!snap) return;
      const prev = writtenScrollRef.current;
      if (prev && prev.top === snap.top && prev.pinned === snap.pinned) return;
      writtenScrollRef.current = snap;
      api.updateParameters({ scrollTop: snap.top, scrollPinned: snap.pinned });
    },
    [api],
  );

  const onScroll = useCallback(() => {
    // Rule 2. A detached scroller (this tab was just deselected) reads 0, and
    // a restore still in flight is assigning clamped values that arrive here
    // looking like user input. Neither is a position worth learning from.
    if (!onScreenRef.current || !restoreDoneRef.current) return;
    const el = scrollerRef.current;
    if (!el) return;
    // A transcript re-paint that momentarily shortens the content makes the
    // browser clamp the offset, which arrives here indistinguishable from the
    // user jumping to the top. Leave the remembered position alone.
    if (isClampedScroll(el, liveScrollRef.current?.top)) return;
    const snap = { top: el.scrollTop, pinned: isPinnedToBottom(el) };
    liveScrollRef.current = snap;
    setPinnedToBottom(snap.pinned);
    if (scrollSaveTimerRef.current !== null) {
      clearTimeout(scrollSaveTimerRef.current);
    }
    scrollSaveTimerRef.current = setTimeout(() => {
      scrollSaveTimerRef.current = null;
      writeScrollParams(snap);
    }, SCROLL_SAVE_DEBOUNCE_MS);
  }, [writeScrollParams]);

  const finishRestore = useCallback((el: HTMLElement | null) => {
    restoreDoneRef.current = true;
    if (!el) return;
    const pinned = isPinnedToBottom(el);
    liveScrollRef.current = { top: el.scrollTop, pinned };
    setPinnedToBottom(pinned);
  }, []);

  // The "jump to latest" button's click handler — scrolls to the bottom and,
  // by recording `pinned: true`, hands the transcript back to the autoscroll
  // effect below so it keeps following the stream, not just this one jump.
  const jumpToBottom = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    scrollToBottom(el);
    const snap = { top: el.scrollTop, pinned: true };
    liveScrollRef.current = snap;
    setPinnedToBottom(true);
    writeScrollParams(snap);
  }, [writeScrollParams]);

  // Every transcript change is another chance for the content to grow tall
  // enough to hold a saved offset, so it also extends the retry window below.
  useEffect(() => {
    lastTranscriptChangeRef.current = Date.now();
  }, [transcript, permissions, phase.status]);

  // The restore driver — rule 1. Re-runs on every transition on screen and on
  // every change of conversation, then retries the target once per frame until
  // it sticks. Frames rather than renders because the transcript's height also
  // settles without React (a web font landing, an image in a tool result), and
  // a `ResizeObserver` on the scroller can't see that either: its own box
  // never changes as its content grows, which is exactly why the first attempt
  // at this restored nothing.
  //
  // `params` is read through a ref on purpose: every later write to
  // `params.scrollTop` is one of this panel's own saves, and re-arming on
  // those would yank the scroller out from under the user mid-scroll.
  useLayoutEffect(() => {
    if (!onScreen) return;
    const p = paramsRef.current;
    const target = restoreTargetFor(
      liveScrollRef.current ??
        persistedScroll(
          profileId,
          p.sessionId,
          p.scrollTop,
          p.scrollPinned,
          scrollBucket,
        ),
    );
    restoreDoneRef.current = false;

    const armedAt = Date.now();
    lastTranscriptChangeRef.current = armedAt;
    let frame = 0;
    // Caught live (2026-09-14, Dave's words: "right for a split second, then
    // scrolls to top"): a workspace switch can read `scrollTop` back as
    // correct within the first couple of frames, then have it silently
    // clamped again a beat later — observed on WebKit, with no `scroll` event
    // to mark the change, so nothing downstream notices. Continuing to
    // re-assert the target across the whole `SCROLL_RESTORE_GUARD_MS` window
    // — instead of trusting the first good frame — is what catches that:
    // `applyRestoreStep` unconditionally re-writes `scrollTop` on every call,
    // so a late clamp gets overwritten on the very next retry instead of
    // standing unnoticed. See `restoreIsStable`.
    let firstReachedAt: number | null = null;
    const attempt = () => {
      const el = scrollerRef.current;
      const reached = !!el && applyRestoreStep(el, target);
      if (reached) {
        const now = Date.now();
        if (firstReachedAt === null) firstReachedAt = now;
        if (restoreIsStable(now, firstReachedAt)) {
          finishRestore(el);
          return;
        }
        frame = requestAnimationFrame(attempt);
        return;
      }
      firstReachedAt = null;
      if (
        shouldAbandonRestore(
          Date.now(),
          armedAt,
          lastTranscriptChangeRef.current,
          hasEntriesRef.current,
        )
      ) {
        // The offset was never reachable — the conversation came back shorter
        // than it was saved at (a `/clear`, a compaction, a journal that
        // replayed fewer entries). Take the clamped position and hand control
        // back, rather than suppressing saves for the life of the panel.
        finishRestore(el);
        return;
      }
      frame = requestAnimationFrame(attempt);
    };
    attempt();
    return () => cancelAnimationFrame(frame);
  }, [onScreen, scrollBucket, profileId, finishRestore]);

  // Keep a transcript that was following the stream pinned to the bottom as
  // entries arrive. No dependency array on purpose — every commit is a chance
  // for the content to have grown — and idempotent, so running it on an
  // unrelated re-render (a keystroke in the composer) changes nothing. Skipped
  // while off screen: the offset there is either discarded (detached) or the
  // user's parked position (backgrounded workspace), and neither wants
  // scrolling.
  useLayoutEffect(() => {
    const el = scrollerRef.current;
    if (!el || !onScreen || !restoreDoneRef.current) return;
    if (liveScrollRef.current?.pinned === false) return;
    scrollToBottom(el);
  });

  // Leaving the screen is the moment to get `params` current, in case the
  // debounce above is still pending. The position comes from the ref, never
  // the DOM — rule 2.
  useEffect(() => {
    if (onScreen || !restoreDoneRef.current) return;
    if (scrollSaveTimerRef.current !== null) {
      clearTimeout(scrollSaveTimerRef.current);
      scrollSaveTimerRef.current = null;
    }
    writeScrollParams(liveScrollRef.current);
  }, [onScreen, writeScrollParams]);

  const isMac =
    typeof navigator !== "undefined" &&
    navigator.platform.toUpperCase().includes("MAC");
  const cmdKey = isMac ? "⌘" : "Ctrl";

  const openChatLink = useCallback(
    (kind: "url" | "path", text: string) => {
      if (kind === "url") {
        void ctx.ui.openExternal(text);
        return;
      }
      void (async () => {
        const home = text.startsWith("~/")
          ? (await ctx.system.homeDir()).replace(/\/$/, "")
          : undefined;
        ctx.editors.open(resolveChatFilePath(text, cwd, home), {
          workspaceId,
        });
      })();
    },
    [ctx, cwd, workspaceId],
  );

  const onTranscriptClick = useCallback(
    (e: MouseEvent) => {
      const link = chatLinkFromTarget(e.target);
      if (!link || !isLinkActivationClick(e, isMac)) return;
      e.preventDefault();
      openChatLink(link.kind, link.text);
    },
    [openChatLink],
  );

  const onTranscriptContextMenu = useCallback(
    (e: MouseEvent) => {
      e.preventDefault();
      const selection = window.getSelection()?.toString() ?? "";
      const link = chatLinkFromTarget(e.target);
      void ctx.ui.showMenu({
        at: { x: e.clientX, y: e.clientY },
        items: buildChatSelectionMenu({
          selection,
          link,
          cmdKey,
          onCopy: () => void navigator.clipboard.writeText(selection),
          onSelectAll: () => {
            const el = scrollerRef.current;
            if (!el) return;
            const range = document.createRange();
            range.selectNodeContents(el);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
          },
          onOpenLink: link
            ? () => openChatLink(link.kind, link.text)
            : undefined,
          onCopyLink: link
            ? () => void navigator.clipboard.writeText(link.text)
            : undefined,
          // Hidden while there is no session yet — nothing to reset.
          onClear: canReset ? () => void requestReset() : undefined,
          clearAccelerator: clearShortcutLabel(isMac),
        }),
      });
    },
    [ctx, openChatLink, cmdKey, isMac, canReset, requestReset],
  );

  // ⌘⇧K / Ctrl+Shift+K anywhere in the panel, including the composer — a
  // panel-local listener rather than a document one, so a terminal's own ⌘⇧K
  // (the `core.terminal.clear` keybinding) is untouched and a background Chat
  // panel never answers for the one the user is looking at.
  const onPanelKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!canReset || !isClearShortcut(e, isMac)) return;
      e.preventDefault();
      void requestReset();
    },
    [canReset, isMac, requestReset],
  );

  // Anything else in the panel that already handles its own click (a link
  // activation, a tool/tool-group toggle, any button) runs first and, for
  // the link case, calls preventDefault — this only fires for the
  // "background" of the panel, so clicking near the composer works like
  // clicking a text field instead of requiring the textarea itself.
  //
  // A single `focus()` is enough, even though the effect above needs a whole
  // rAF retry loop to beat dockview's focus shuffle. The two divide the work:
  // a background click on a panel that *isn't* active activates it, which
  // fires `onDidActiveChange`, and the retry loop takes it from there. This
  // handler uniquely serves the already-active case — no activation, so no
  // shuffle, so no race to lose.
  //
  // It is also deliberately unguarded, unlike every `retryFocus` caller. ADR
  // 0034 made `stillWanted` required to kill unguarded focus grabs, but those
  // were mount- and restore-time steals that ran without the user asking for
  // anything; a direct click on this panel *is* the activation intent — the
  // one case where focus and activation genuinely agree.
  const onPanelClick = useCallback((e: MouseEvent) => {
    if (e.defaultPrevented) return;
    const hasSelection = (window.getSelection()?.toString() ?? "") !== "";
    if (!isPanelBackgroundClick(e.target, hasSelection)) return;
    inputRef.current?.focus();
  }, []);

  // Memoized because it is a prop of every memoized row: rebuilt each render,
  // it would defeat `TranscriptRow` entirely. `expandedTools` only changes
  // identity on a toggle, and the other two never do.
  const toolRowState: ToolRowState = useMemo(
    () => ({ expandedTools, onToggleTool: toggleTool, isMac }),
    [expandedTools, toggleTool, isMac],
  );
  // The turn projection is pure in `entries`, and `entries` only changes when
  // the transcript does — so a render triggered by anything else (a workspace
  // switch, a composer keystroke) reuses it rather than re-grouping the whole
  // session.
  const turns = useMemo(
    () => groupTurns(transcript.entries),
    [transcript.entries],
  );

  const window_ = transcriptWindow({
    onScreen,
    idleDropped,
    headRevealed,
    turnCount: turns.length,
    spacerPx,
  });

  // Keep the head's height current while it is on screen and fully rendered,
  // so the drop timer has a believable number to hand the spacer. Skipped
  // unless everything is rendered — measuring a tail-only transcript would
  // record the wrong span.
  //
  // A plain timeout, deliberately not `requestAnimationFrame`: rAF is
  // suspended while Silo's window is not frontmost, so a panel that is only
  // ever on screen in a background window would never get measured and would
  // never drop its head. The delay doubles as a debounce — a streaming
  // transcript changes many times a second, and each measurement forces a
  // layout read.
  useEffect(() => {
    if (!onScreen || window_.kind !== "all") return;
    const id = setTimeout(() => {
      const el = scrollerRef.current;
      if (!el) return;
      const rows = el.querySelectorAll<HTMLElement>(":scope > .acp-chat__turn");
      const boundary = rows.length - TRANSCRIPT_TAIL_TURNS;
      if (boundary <= 0) return;
      const first = rows[0];
      const cut = rows[boundary];
      if (!first || !cut) return;
      const gap = Number.parseFloat(getComputedStyle(el).rowGap) || 0;
      headSpanRef.current = spacerHeightPx({
        headSpanPx: cut.offsetTop - first.offsetTop,
        rowGapPx: gap,
      });
    }, HEAD_MEASURE_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [onScreen, window_.kind, turns]);

  if (phase.status === "no-profile") {
    return (
      <div className="acp-chat" ref={rootRef}>
        <div className="acp-chat__notice">
          <EmptyState
            title="No Chat agent profile"
            description="A Chat panel connects to an Agent Profile whose interface is Chat. Add one on Settings → Agents → Profiles, then check again."
            action={
              <Button onClick={() => setNonce((n) => n + 1)}>
                Check again
              </Button>
            }
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className="acp-chat"
      ref={rootRef}
      onClick={onPanelClick}
      onKeyDown={onPanelKeyDown}
    >
      <div
        className="acp-chat__scroller"
        ref={scrollerRef}
        onScroll={onScroll}
        onClick={onTranscriptClick}
        onContextMenu={onTranscriptContextMenu}
      >
        {phase.status === "error" ? (
          <div className="acp-chat__notice">
            <EmptyState
              title={`Could not start ${profile?.label ?? "the agent"}`}
              description={phase.message}
              action={
                <Button onClick={() => setNonce((n) => n + 1)}>Retry</Button>
              }
            />
          </div>
        ) : null}

        {/* Off screen, the transcript renders no rows at all.
         *
         * Not a paint optimization — the browser already skips painting a
         * hidden dock. This is about **render-tree size**, which is the second
         * of the two factors behind RFC 0050's stall:
         *
         *  1. Once the WebContent process crosses WebKit's memory-pressure
         *     threshold (measured cliff 1.5-1.8 GB), WebKit's pressure handler
         *     starts dropping the style resolver and inline-layout caches. That
         *     invalidates style and layout for the **entire document**, on
         *     WebKit's own timer, with no JavaScript involved.
         *  2. The cost of each of those is proportional to the whole document's
         *     render tree — 390 ms at 87k nodes versus 52 ms at 698.
         *
         * `CenterDock` keeps every warmed workspace's dock in that one
         * document, and a real transcript is ~15,000 nodes, so N warmed
         * workspaces multiply factor 2 by N. Rendering only the on-screen
         * transcript keeps the tree at one transcript's worth no matter how
         * many workspaces are warm.
         *
         * Safe to drop the rows because **the panel does not unmount** — this
         * is the same component, returning fewer children. `transcript.entries`
         * stays in memory, so there is no re-seed from the journal, no second
         * fold, and no entry-identity churn. The only thing DOM detachment
         * costs is `scrollTop`, which this panel already stores twice over
         * (`liveScrollRef` plus `params.scrollTop` in its `DockPanelRecord`)
         * and already re-asserts on every transition back on screen — see the
         * scroll-restore design comment above.
         *
         * Terminals are deliberately untouched: this is why the fix lives here
         * and not in `CenterDock`. Unmounting a whole dock would force an xterm
         * refit, which is the very thing the warmed-dock design exists to avoid.
         */}
        {/* Stands in for the turns above the tail, at their measured height, so
            total content height — and therefore `scrollTop` — is unchanged by
            the swap. Scrolling up into it calls `revealHead`. */}
        {window_.kind === "tail" ? (
          <div
            className="acp-chat__head-spacer"
            style={{ height: window_.spacerPx }}
            aria-hidden="true"
          />
        ) : null}

        {window_.kind !== "dropped"
          ? (window_.kind === "tail" ? turns.slice(window_.from) : turns).map(
              (turn, i, all) => {
                const running = busy && i === all.length - 1;
                return (
                  <TranscriptTurn
                    key={turn.key}
                    turn={turn}
                    tools={toolRowState}
                    running={running}
                    durationMs={
                      turn.user ? turnDurations[turn.user.key] : undefined
                    }
                    // Only the running turn is told when the turn started —
                    // otherwise every *finished* turn would take a new
                    // `startedAt` the moment the next one begins, and all of them
                    // would re-render for a value none of them shows.
                    startedAt={
                      running ? turnStartRef.current?.startedAt : undefined
                    }
                  />
                );
              },
            )
          : null}

        {/* Inline, in the flow of the transcript — never a modal. The agent is
            blocked on this answer, and a modal would both hide the transcript
            that explains what it is asking about and stop the user reading the
            rest of the app. */}
        {permissions.map((pending) => (
          <div key={pending.key} className="acp-chat__permission">
            <div className="acp-chat__permission-title">
              {pending.request.title}
            </div>
            {/* Recon Finding 1: an agent may touch the filesystem without ever
                asking. Silo must not imply it gates anything. */}
            <div className="acp-chat__permission-note">
              The agent asked before doing this. It is not required to — Silo
              does not gate what an agent can do.
            </div>
            <div className="acp-chat__permission-actions">
              {pending.request.options.map((option) => (
                <Button
                  key={option.optionId}
                  size="sm"
                  variant={permissionButtonVariant(option.kind)}
                  onClick={() => answer(pending, option.optionId)}
                >
                  {option.name}
                </Button>
              ))}
            </div>
          </div>
        ))}

        {/* RFC 0042: neither `session/resume` nor `session/load` worked for
            this persisted session. The transcript above is the journal alone
            — there is no live agent to prompt in place. */}
        {readOnly ? (
          <div className="acp-chat__notice">
            <EmptyState
              title="This session can't be resumed"
              description={`${profile?.label ?? agentName ?? "The agent"} could not reconnect this conversation. Nothing is lost — start a new one to keep going.`}
              action={
                <Button onClick={continueInNewSession}>
                  Continue in a new session
                </Button>
              }
            />
          </div>
        ) : null}
      </div>

      <div className="acp-chat__composer">
        {pinnedToBottom ? null : (
          <Tooltip content="Jump to latest">
            <IconButton
              className="acp-chat__jump-to-bottom"
              aria-label="Jump to latest"
              onClick={jumpToBottom}
            >
              <CaretDown size="1em" weight="bold" aria-hidden="true" />
            </IconButton>
          </Tooltip>
        )}
        {attachments.length > 0 ? (
          <div className="acp-chat__attachments" data-pending>
            {attachments.map((att) => (
              <span key={att.uri} className="acp-chat__chip">
                {att.name}
                <button
                  type="button"
                  className="acp-chat__chip-remove"
                  aria-label={`Remove ${att.name}`}
                  onClick={() =>
                    setAttachments((prev) =>
                      prev.filter((a) => a.uri !== att.uri),
                    )
                  }
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
        {showPalette ? (
          <div ref={paletteRef} className="acp-chat__command-palette">
            <List
              aria-label="Slash commands"
              onActivate={(i) => pickCommand(paletteCommands[i])}
            >
              {paletteCommands.map((command, i) => (
                <ListRow
                  key={command.name}
                  selected={i === activePaletteIndex}
                  leading={<Command size="1em" aria-hidden="true" />}
                  trailing={
                    <span className="acp-chat__cmd-slash">/{command.name}</span>
                  }
                  onSelect={() => pickCommand(command)}
                >
                  <span className="acp-chat__cmd-title">
                    {commandDisplayTitle(command.name)}
                  </span>
                  {command.description ? (
                    <span className="acp-chat__cmd-desc">
                      {command.description}
                    </span>
                  ) : null}
                </ListRow>
              ))}
            </List>
          </div>
        ) : null}
        <Textarea
          ref={inputRef}
          className="acp-chat__input"
          value={draft}
          rows={2}
          placeholder={composerPlaceholder(lost, readOnly)}
          disabled={!inputEnabled}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setDraft(e.target.value);
            // Any real edit detaches from the recalled entry — the same way
            // a shell's readline history works.
            if (historyNav.index !== null)
              setHistoryNav(NOT_NAVIGATING_HISTORY);
          }}
          onPaste={onComposerPaste}
          onKeyDown={(e) => {
            if (showPalette) {
              const nav = paletteNavAction(e.key, e.shiftKey);
              if (nav) {
                e.preventDefault();
                if (nav === "up" || nav === "down") {
                  setPaletteIndex(
                    stepPaletteIndex(
                      activePaletteIndex,
                      nav,
                      paletteCommands.length,
                    ),
                  );
                  return;
                }
                if (nav === "pick") {
                  const command = paletteCommands[activePaletteIndex];
                  if (command) pickCommand(command);
                  return;
                }
                setPaletteDismissed(true);
                return;
              }
            }
            // ↑/↓ recall past prompts (terminal-shell convention) — but only
            // once the caret is already on the draft's first/last line, so a
            // multi-line draft still gets normal caret movement first.
            if (e.key === "ArrowUp" && !e.shiftKey) {
              const el = e.currentTarget;
              if (caretOnFirstLine(draft, el.selectionStart ?? 0)) {
                const next = historyNavUp(
                  userPromptHistory(transcript),
                  historyNav,
                  draft,
                );
                if (next) {
                  e.preventDefault();
                  setHistoryNav(next.state);
                  setDraft(next.draft);
                  requestAnimationFrame(() => {
                    el.setSelectionRange(next.draft.length, next.draft.length);
                  });
                }
              }
              return;
            }
            if (e.key === "ArrowDown" && !e.shiftKey) {
              const el = e.currentTarget;
              if (caretOnLastLine(draft, el.selectionStart ?? 0)) {
                const next = historyNavDown(
                  userPromptHistory(transcript),
                  historyNav,
                );
                if (next) {
                  e.preventDefault();
                  setHistoryNav(next.state);
                  setDraft(next.draft);
                  requestAnimationFrame(() => {
                    el.setSelectionRange(next.draft.length, next.draft.length);
                  });
                }
              }
              return;
            }
            // A single Escape while a turn is in flight cancels it and hands
            // the just-sent prompt back to the composer — "let me fix that"
            // is the whole reason to interrupt, so the text goes with it,
            // discarding whatever unrelated draft was mid-typing underneath.
            // Otherwise a *second* Escape within DOUBLE_ESCAPE_MS of the
            // first clears the draft; a lone Escape does nothing special.
            if (e.key === "Escape") {
              if (busy) {
                e.preventDefault();
                handleRef.current?.cancel();
                const history = userPromptHistory(transcript);
                const lastSent = history[history.length - 1];
                setHistoryNav(NOT_NAVIGATING_HISTORY);
                if (lastSent !== undefined) {
                  setDraft(lastSent);
                  requestAnimationFrame(() => {
                    inputRef.current?.setSelectionRange(
                      lastSent.length,
                      lastSent.length,
                    );
                  });
                }
                lastEscapeAtRef.current = 0;
                return;
              }
              const now = Date.now();
              if (isDoubleEscape(lastEscapeAtRef.current, now)) {
                lastEscapeAtRef.current = 0;
                e.preventDefault();
                setDraft("");
                setHistoryNav(NOT_NAVIGATING_HISTORY);
              } else {
                lastEscapeAtRef.current = now;
              }
              return;
            }
            // Enter sends; Shift+Enter is a newline — the convention every
            // chat composer in the category uses.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div
          className="acp-chat__controls"
          data-connecting={connecting ? "true" : undefined}
        >
          {/* Pill + chevron, opening the host's own floating dropdown —
              Paseo's model/effort/permission-mode pickers are exactly this
              shape (RFC 0043 finding 2), and it's the kit's own documented
              answer for "pick one of these" (`AgentProfilesService`'s own
              doc example: build it from `list()` and `ctx.ui.showMenu`). A
              native `<select>` can't float over the transcript the way this
              does — its popup is OS chrome, not the host's. */}
          <MenuButton
            className="acp-chat__profile"
            size="sm"
            label={profile?.label ?? "Profile"}
            aria-label="Chat agent profile"
            onClick={(e) =>
              void ctx.ui.showMenu({
                anchor: e.currentTarget,
                items: available.map((p) => ({
                  label: p.label,
                  checked: p.id === profileId,
                  run: () => void switchProfile(p.id),
                })),
              })
            }
          />
          {connecting ? (
            <div className="acp-chat__connecting" aria-live="polite">
              <ArrowsClockwise
                className="acp-chat__spin"
                size="1em"
                aria-hidden="true"
              />
              Connecting to agent…
            </div>
          ) : (
            <>
              {/* A plus icon, not the paperclip — sized up (`size="normal"`, not
                  `"sm"`) to read as its own affordance next to the pill buttons
                  rather than a stray toolbar glyph. */}
              <Tooltip content="Attach a file">
                <IconButton
                  aria-label="Attach a file"
                  disabled={phase.status !== "ready" || lost || readOnly}
                  onClick={() => void attachFile()}
                >
                  <Plus size="1em" aria-hidden="true" />
                </IconButton>
              </Tooltip>
              {/* One control per advertised session control — no per-agent code.
                  Cursor gets mode + model; Claude gets its permission mode. An
                  entry whose `type` we do not recognise is skipped, the same
                  tolerance rule the update stream follows. */}
              {configOptions
                .filter(
                  (opt) => opt.type === "select" && !deadConfigIds.has(opt.id),
                )
                .map((opt) => (
                  <div
                    key={opt.id}
                    className="acp-chat__option acp-chat__config"
                  >
                    <span className="acp-chat__option-label">{opt.name}</span>
                    <MenuButton
                      size="sm"
                      label={
                        opt.options.find((c) => c.value === opt.currentValue)
                          ?.name ?? opt.currentValue
                      }
                      aria-label={opt.name}
                      disabled={phase.status !== "ready" || lost || readOnly}
                      onClick={(e) =>
                        void ctx.ui.showMenu({
                          anchor: e.currentTarget,
                          items: opt.options.map((choice) => ({
                            label: choice.name,
                            checked: choice.value === opt.currentValue,
                            run: () => setConfigOption(opt.id, choice.value),
                          })),
                        })
                      }
                    />
                  </div>
                ))}
              {/* Client-side stand-in for agents with no "stop asking me"
                  mode of their own (ported from Paseo) — hidden whenever
                  the agent already offers one (`showAutoAccept`), so this
                  never sits next to Claude's own Bypass mode as a second,
                  confusing way to do the same thing. */}
              {showAutoAccept ? (
                <Tooltip
                  content={
                    autoAccept
                      ? "Auto Accept: on — answering every permission request itself"
                      : "Auto Accept: off — click to answer every permission request itself, without asking"
                  }
                >
                  <Button
                    size="sm"
                    variant={autoAccept ? "primary" : "normal"}
                    className="acp-chat__auto-accept"
                    aria-label="Auto Accept permission requests"
                    aria-pressed={autoAccept}
                    disabled={phase.status !== "ready" || lost || readOnly}
                    onClick={() => setAutoAccept((v) => !v)}
                  >
                    <Shield size="1em" weight="bold" aria-hidden="true" />
                    Auto Accept
                  </Button>
                </Tooltip>
              ) : null}
            </>
          )}
          {/* Pinned to the far right regardless of how many config pills the
              agent advertised. */}
          <div className="acp-chat__send-slot">
            {readOnly ? (
              <Button
                size="sm"
                variant="primary"
                onClick={continueInNewSession}
              >
                Continue in a new session
              </Button>
            ) : lost ? (
              <Button size="sm" onClick={() => setNonce((n) => n + 1)}>
                Reconnect
              </Button>
            ) : busy ? (
              <Tooltip content="Stop">
                <IconButton
                  className="acp-chat__stop"
                  aria-label="Stop"
                  onClick={() => handleRef.current?.cancel()}
                >
                  <StopIcon size="1em" weight="fill" aria-hidden="true" />
                </IconButton>
              </Tooltip>
            ) : (
              <Tooltip content="Send">
                <IconButton
                  className="acp-chat__send"
                  aria-label="Send"
                  disabled={!canSend}
                  onClick={() => void send()}
                >
                  <ArrowUp size="1em" weight="bold" aria-hidden="true" />
                </IconButton>
              </Tooltip>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

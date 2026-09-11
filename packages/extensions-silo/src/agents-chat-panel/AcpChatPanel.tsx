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
  useCallback,
  useEffect,
  useLayoutEffect,
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
  CaretRight,
  Command,
  FileText,
  Globe,
  Lightbulb,
  MagnifyingGlass,
  PencilSimple,
  Plug,
  Plus,
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
  EmptyState,
  IconButton,
  List,
  ListRow,
  MenuButton,
  Textarea,
  Tooltip,
} from "@silo-code/sdk";
import { chatProfiles, resolveChatProfile } from "./profile-selection";
import {
  applyRestoreStep,
  isClampedScroll,
  isPinnedToBottom,
  persistedScroll,
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
  paletteNavAction,
  stepPaletteIndex,
} from "./command-palette";
import {
  composerCanSend,
  composerInputEnabled,
  composerPlaceholder,
  composerShowConnecting,
} from "./composer-model";
import {
  appendNotice,
  appendUserMessage,
  applyUpdate,
  emptyTranscript,
  formatToolInput,
  groupTurns,
  toolOutputIsMarkdown,
  nextEntryKey,
  seedFromJournal,
  stopReasonNotice,
  toolStatusTone,
  workedForLabel,
  type TranscriptEntry,
  type Transcript,
} from "./transcript-model";
import { permissionButtonVariant } from "./permission-options";
import { TranscriptMarkdown } from "./TranscriptMarkdown";
import { LinkifiedText, chatLinkFromTarget } from "./LinkifiedText";
import { isLinkActivationClick } from "./link-policy";
import { resolveChatFilePath } from "./resolve-chat-path";
import { buildChatSelectionMenu } from "./selection-menu";
import {
  formatToolKindLabel,
  toolIconId,
  type ToolIconId,
} from "./tool-display";
import {
  diffHeading,
  diffLines,
  toolInputIsDiffOnly,
  toolShowsInlineDiff,
  type ToolDiff,
} from "./tool-diff";
import {
  continueInNewSessionOption,
  isReadOnly,
  panelStateAfterConnect,
  resumeOptionFor,
} from "./session-restore";
import { LiveElapsed } from "./LiveElapsed";

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
   * The working directory the session was launched in, persisted alongside
   * `sessionId` (RFC 0042 `ChatPanelState`). Informational — the live
   * workspace folder is always what's actually sent to `connect()`.
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
  return (
    <div
      className={
        inline ? "acp-chat__tool-inline-diff" : "acp-chat__tool-section"
      }
    >
      <div className="acp-chat__tool-section-label">
        {diffHeading(diff, lines)}
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
 * One transcript entry (RFC 0043 finding 1). A plain function, not a
 * component: every `TranscriptEntry` (plus, for a tool row, {@link
 * ToolRowState}) carries everything its row needs, so this is reusable for a
 * turn's user message and its `rest` alike without threading the rest of the
 * panel's state through it.
 *
 * A routine tool call is a single compact line — kind glyph, a display
 * label from {@link formatToolKindLabel} (when the agent gave a kind), its
 * title. Only a call blocked on the user earns a
 * box while collapsed (`.acp-chat__permission`). `status` only earns a badge
 * when it's informative: `"pending"`/`"completed"` are the expected states a
 * call passes through silently. Collapsed by default: clicking a row with
 * something to show expands it into a bordered card with **Input** / **Output**
 * wells (`rawInput` vs. the modelled `content` lines).
 */
function renderTranscriptEntry(entry: TranscriptEntry, tools: ToolRowState) {
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
    const kindLabel = formatToolKindLabel(entry.toolKind, entry.title);
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
          onClick={hasBody ? toggle : undefined}
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
          <span className="acp-chat__tool-title">{entry.title}</span>
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
  const cwd = ws.all.find((w) => w.id === workspaceId)?.folder ?? "";

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
  const [agentName, setAgentName] = useState<string | undefined>();
  // The connected session's `AgentInfo.id`. Held in state (not just the handle
  // ref) because it is what the tab-chrome and title effects key on.
  const [sessionId, setSessionId] = useState<string | undefined>();
  // How this connection came to be (RFC 0042) — `"journal-only"` is the one
  // value that changes what the composer offers. Snapshotted once per
  // connect(); the panel doesn't need to react to it changing afterward.
  const [resumeOutcome, setResumeOutcome] =
    useState<AgentSessionHandle["resumeOutcome"]>("new");
  // Set by "Continue in a new session" just before bumping `nonce` — read and
  // cleared at the top of the next connect attempt. A ref, not state: it must
  // be visible to the very effect run it triggers, with no extra render.
  const continueFreshRef = useRef(false);
  const [draft, setDraft] = useState("");
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
    const subs: Disposable[] = [];
    // "Continue in a new session" (RFC 0042) set this just before bumping
    // `nonce` to force this reconnect past resume/load and straight to a
    // fresh `session/new`, while keeping the journal's identity. Consumed
    // once — a later reconnect (a crash, "Reconnect") goes through the normal
    // resume → load → journal flow again.
    const startFresh = continueFreshRef.current;
    continueFreshRef.current = false;
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
    const restoreSessionId = params.sessionId ?? undefined;
    const resume = restoreSessionId
      ? startFresh
        ? continueInNewSessionOption(restoreSessionId)
        : resumeOptionFor(restoreSessionId)
      : undefined;

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
          handle.onPermission((request) =>
            setPermissions((prev) => [
              ...prev,
              { key: `p${++permissionSeq.current}`, request },
            ]),
          ),
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
      for (const sub of subs) sub.dispose();
      const handle = handleRef.current;
      handleRef.current = null;
      // Reap the process. Closing the tab, switching profiles and reloading
      // the webview each used to leak an agent child during the spike — ten
      // piled up in one afternoon.
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

  // --- sending -------------------------------------------------------------
  const send = useCallback(async () => {
    const handle = handleRef.current;
    const text = draft.trim();
    const files = attachments;
    if (
      !handle ||
      busy ||
      !composerCanSend({
        ready: phase.status === "ready",
        lost,
        draft,
        attachmentCount: files.length,
      })
    ) {
      return;
    }
    setDraft("");
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
      const started = turnStartRef.current;
      if (started) {
        const durationMs = Date.now() - started.startedAt;
        setTurnDurations((prev) => ({ ...prev, [started.key]: durationMs }));
        turnStartRef.current = null;
      }
    }
  }, [draft, busy, attachments, transcript, phase.status, lost]);

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

  // Dockview shuffles DOM focus when a tab becomes active; a single
  // `focus()` loses that race. Retry across frames while this panel is
  // still the active tab — the same problem the terminal/editor viewers
  // solve with host `useFocusOnActive`, which a silo.* extension cannot
  // import. The input is enabled during connect, so this runs as soon as
  // the panel is created — they can draft before the agent is live.
  useEffect(() => {
    if (!inputEnabled) return;

    let raf = 0;
    let frames = 0;
    let landed = false;
    const tick = () => {
      if (!api.isActive) return;
      const el = inputRef.current;
      if (!el) return;
      const active = document.activeElement;
      if (active === el) {
        landed = true;
      } else if (
        active instanceof Element &&
        active.closest("[data-silo-menu], [role='menu']")
      ) {
        return;
      } else if (!landed || active === null || active === document.body) {
        el.focus();
      }
      frames += 1;
      if (frames < 20 && api.isActive) raf = requestAnimationFrame(tick);
    };
    const start = () => {
      if (!api.isActive) return;
      frames = 0;
      landed = false;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(tick);
    };

    start();
    const sub = api.onDidActiveChange(({ isActive }) => {
      if (isActive) start();
    });
    return () => {
      cancelAnimationFrame(raf);
      sub.dispose();
    };
  }, [api, inputEnabled]);

  const continueInNewSession = useCallback(() => {
    continueFreshRef.current = true;
    setNonce((n) => n + 1);
  }, []);

  // The `/` command palette (RFC 0040) — a filtered list on `session.commands`
  // while the draft is authoring a command name, no raw read. `commandQuery`
  // is `undefined` once a space follows the `/` (the user is now typing the
  // argument), which also closes the palette.
  const commandQuery = commandQueryFromDraft(draft);
  const paletteCommands =
    commandQuery !== undefined ? filterCommands(commands, commandQuery) : [];
  const showPalette =
    paletteCommands.length > 0 &&
    !paletteDismissed &&
    phase.status === "ready" &&
    !lost &&
    !readOnly;
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
    liveScrollRef.current = {
      top: el.scrollTop,
      pinned: isPinnedToBottom(el),
    };
  }, []);

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
    const attempt = () => {
      const el = scrollerRef.current;
      if (el && applyRestoreStep(el, target)) {
        finishRestore(el);
        return;
      }
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
        }),
      });
    },
    [ctx, openChatLink],
  );

  const toolRowState: ToolRowState = {
    expandedTools,
    onToggleTool: toggleTool,
  };

  if (phase.status === "no-profile") {
    return (
      <div className="acp-chat">
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
    <div className="acp-chat">
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

        {groupTurns(transcript.entries).map((turn, i, all) => {
          const running = busy && i === all.length - 1;
          const durationMs = turn.user
            ? turnDurations[turn.user.key]
            : undefined;
          return (
            <div key={turn.key} className="acp-chat__turn">
              {turn.user
                ? renderTranscriptEntry(turn.user, toolRowState)
                : null}
              {turn.rest.length > 0 ? (
                <div className="acp-chat__turn-body">
                  {turn.rest.map((e) => renderTranscriptEntry(e, toolRowState))}
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
                  <LiveElapsed
                    startedAt={turnStartRef.current?.startedAt ?? Date.now()}
                  />
                </div>
              ) : durationMs !== undefined ? (
                <div className="acp-chat__turn-footer">
                  {workedForLabel(durationMs)}
                </div>
              ) : null}
            </div>
          );
        })}

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
          onChange={(e) => setDraft(e.target.value)}
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
                  <MenuButton
                    key={opt.id}
                    className="acp-chat__config"
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
                ))}
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

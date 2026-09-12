/**
 * The **Chat panel** (RFC 0038 / 0039) — a center-dock transcript for one Chat
 * session: streaming text, the agent's thinking, tool-call rows, its plan, and
 * inline permission requests.
 *
 * ## It is built on the SDK and nothing else
 *
 * This is `examples/extensions/acp-chat` — an installed extension that resolves
 * `@silo-code/sdk` **only**. There is no `@silo-code/extension-host/internal`
 * import anywhere in it, and there physically cannot be: an example does not
 * depend on the host package, so anything the panel needed from the privileged
 * surface would fail to resolve rather than pass review. The whole panel runs
 * on `ctx.agents.sessions` plus `@silo-code/sdk` types and kit components — if
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
 * The panel kind declares `chatProfileHost: true`, so picking a **Chat** Agent
 * Profile from a dock's **+** menu (or running `silo.acpChat.new`) opens it.
 * `ctx.agents.sessions` needs the `"agents"` permission, declared in this
 * example's `silo.permissions` and granted at install.
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

import { useCallback, useEffect, useRef, useState } from "react";
import type {
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
import { Badge, Button, EmptyState, Select, Textarea } from "@silo-code/sdk";
import { chatProfiles, resolveChatProfile } from "./profile-selection";
import { confirmProfileSwitch } from "./profile-switch";
import { toAttachment, type Attachment } from "./attachments";
import {
  appendNotice,
  appendUserMessage,
  applyUpdate,
  emptyTranscript,
  seedFromJournal,
  stopReasonNotice,
  toolStatusTone,
  type Transcript,
} from "./transcript-model";
import { permissionButtonVariant } from "./permission-options";
import { TranscriptMarkdown } from "./TranscriptMarkdown";
import {
  continueInNewSessionOption,
  isReadOnly,
  panelStateAfterConnect,
  resumeOptionFor,
} from "./session-restore";

/** How close to the bottom still counts as "following the stream". */
const AUTOSCROLL_THRESHOLD_PX = 24;

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

export function AcpChatPanel({
  api,
  params,
  workspaceId,
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
  const [busy, setBusy] = useState(false);
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
  // Files staged for the next turn, sent as `resource_link` prompt blocks.
  const [attachments, setAttachments] = useState<Attachment[]>([]);
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
    if (!handle || busy || (!text && files.length === 0)) return;
    setDraft("");
    setAttachments([]);
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
    }
  }, [draft, busy, attachments]);

  const answer = useCallback((pending: PendingPermission, optionId: string) => {
    pending.request.respond(optionId);
    setPermissions((prev) => prev.filter((p) => p !== pending));
  }, []);

  const attachFile = useCallback(async () => {
    const picked = await ctx.ui.pickFile({ defaultPath: cwd || undefined });
    if (!picked) return;
    const next = toAttachment(picked);
    setAttachments((prev) =>
      prev.some((a) => a.uri === next.uri) ? prev : [...prev, next],
    );
  }, [ctx, cwd]);

  // Switching the profile is a teardown — the agent is reaped and the
  // transcript dropped (see the connect effect). A `Select` in a composer does
  // not look like that, so anything worth losing gets a confirmation first;
  // `confirmProfileSwitch` owns the rule and returns `null` when the switch is
  // free. Declining touches no state, and the Select is controlled off
  // `profileId`, so it snaps back to the live agent on its own.
  const switchProfile = useCallback(
    async (nextId: string) => {
      if (nextId === profileId) return;
      const ask = confirmProfileSwitch(
        transcript,
        busy,
        agentName ?? profile?.label ?? "The agent",
      );
      if (ask && !(await ctx.ui.confirm(ask))) return;
      // The tab remembers the choice, so reopening it comes back on the same
      // agent. The effect above does the teardown. `sessionId` is cleared,
      // not carried over — a session belongs to the agent that created it,
      // and resuming an unrelated one under a different profile is not a
      // thing `session/resume` / `session/load` are defined for.
      setRequestedId(nextId);
      api.updateParameters({ profileId: nextId, sessionId: null });
    },
    [ctx, api, profileId, transcript, busy, agentName, profile?.label],
  );

  const setConfigOption = useCallback((id: string, value: string) => {
    handleRef.current?.setConfigOption(id, value).catch((err) => {
      setTranscript((t) => appendNotice(t, "error", errorMessage(err)));
      // The agent advertised this control but will not accept a write for it
      // — drop it so the user is not left poking a Select that only errors.
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
  const continueInNewSession = useCallback(() => {
    continueFreshRef.current = true;
    setNonce((n) => n + 1);
  }, []);

  // --- autoscroll ----------------------------------------------------------
  // Only when the user is already at the bottom, so reading back through a
  // long turn is not yanked forward by every chunk.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const pinnedRef = useRef(true);
  useEffect(() => {
    const el = scrollerRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [transcript, permissions]);
  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    pinnedRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight <
      AUTOSCROLL_THRESHOLD_PX;
  }, []);

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
      <div className="acp-chat__scroller" ref={scrollerRef} onScroll={onScroll}>
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

        {phase.status === "connecting" ? (
          <div className="acp-chat__status">
            Connecting to {profile?.label ?? "the agent"}…
          </div>
        ) : null}

        {transcript.entries.map((entry) => {
          if (entry.type === "message") {
            return (
              <div
                key={entry.key}
                className="acp-chat__message"
                data-role={entry.role}
              >
                {entry.role === "thought" ? (
                  <div className="acp-chat__thought-label">Thinking</div>
                ) : null}
                {/* The agent writes markdown; the user wrote literal text and
                    their asterisks must stay their asterisks. */}
                {entry.role === "user" ? (
                  <div className="acp-chat__text">{entry.text}</div>
                ) : (
                  <TranscriptMarkdown text={entry.text} />
                )}
                {entry.attachments && entry.attachments.length > 0 ? (
                  <div className="acp-chat__attachments">
                    {entry.attachments.map((name, i) => (
                      <span
                        key={`${entry.key}-att-${i}`}
                        className="acp-chat__chip"
                      >
                        {name}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          }
          if (entry.type === "tool") {
            return (
              <div key={entry.key} className="acp-chat__tool">
                <div className="acp-chat__tool-head">
                  <span className="acp-chat__tool-title">{entry.title}</span>
                  {entry.toolKind ? (
                    <Badge tone="outline" size="sm">
                      {entry.toolKind}
                    </Badge>
                  ) : null}
                  <Badge tone={toolStatusTone(entry.status)} size="sm">
                    {entry.status}
                  </Badge>
                </div>
                {entry.lines.length > 0 ? (
                  <pre className="acp-chat__tool-body">
                    {entry.lines.join("\n")}
                  </pre>
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
              description={`${agentName ?? profile?.label ?? "The agent"} could not reconnect this conversation. Nothing is lost — start a new one to keep going.`}
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
        <Textarea
          className="acp-chat__input"
          value={draft}
          rows={2}
          placeholder={
            readOnly
              ? "This session is read-only — continue in a new one to keep talking."
              : lost
                ? "The agent is no longer running."
                : phase.status === "ready"
                  ? `Message ${agentName ?? profile?.label ?? "the agent"}…`
                  : "Waiting for the agent…"
          }
          disabled={phase.status !== "ready" || lost || readOnly}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            // Enter sends; Shift+Enter is a newline — the convention every
            // chat composer in the category uses.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <div className="acp-chat__controls">
          <Select
            className="acp-chat__profile"
            value={profileId ?? ""}
            aria-label="Chat agent profile"
            onChange={(e) => void switchProfile(e.target.value)}
          >
            {available.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
          {/* One Select per advertised control — no per-agent code. Cursor
              gets mode + model; Claude gets its permission mode. An entry
              whose `type` we do not recognise is skipped, the same tolerance
              rule the update stream follows. */}
          {configOptions
            .filter(
              (opt) => opt.type === "select" && !deadConfigIds.has(opt.id),
            )
            .map((opt) => (
              <Select
                key={opt.id}
                className="acp-chat__config"
                value={opt.currentValue}
                aria-label={opt.name}
                disabled={phase.status !== "ready" || lost || readOnly}
                onChange={(e) => setConfigOption(opt.id, e.target.value)}
              >
                {opt.options.map((choice) => (
                  <option key={choice.value} value={choice.value}>
                    {choice.name}
                  </option>
                ))}
              </Select>
            ))}
          <Button
            size="sm"
            aria-label="Attach a file"
            disabled={phase.status !== "ready" || lost || readOnly}
            onClick={() => void attachFile()}
          >
            Attach
          </Button>
          {readOnly ? (
            <Button size="sm" variant="primary" onClick={continueInNewSession}>
              Continue in a new session
            </Button>
          ) : lost ? (
            <Button size="sm" onClick={() => setNonce((n) => n + 1)}>
              Reconnect
            </Button>
          ) : busy ? (
            <Button size="sm" onClick={() => handleRef.current?.cancel()}>
              Stop
            </Button>
          ) : (
            <Button
              size="sm"
              variant="primary"
              disabled={
                phase.status !== "ready" ||
                lost ||
                (draft.trim().length === 0 && attachments.length === 0)
              }
              onClick={() => void send()}
            >
              Send
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

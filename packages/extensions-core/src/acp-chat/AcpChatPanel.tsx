/**
 * The bundled **Chat panel** (RFC 0038 phase 3) — a center-dock transcript for
 * one Chat session: streaming text, the agent's thinking, tool-call rows, its
 * plan, and inline permission requests.
 *
 * ## It is built on the SDK and nothing else
 *
 * The whole panel runs on `ctx.agents.sessions` plus `@silo-code/sdk` types and
 * kit components. There is **no `@silo-code/extension-host/internal` import in
 * this directory** — no transport, no protocol client, no host state — which is
 * the point of the phase: everything this panel does, a third-party extension
 * can do. If something here had needed the privileged barrel, the SDK would be
 * wrong and the fix would be to widen `ctx.agents.sessions`, never to reach
 * around it.
 *
 * The spike's `@acp-components` dependency is gone with it. That library owns
 * the protocol client and wants a *transport*, which the SDK deliberately does
 * not hand out (RFC 0038: the connection is host-owned); feeding it would have
 * meant re-encoding the SDK's stream back into JSON-RPC frames for a second
 * protocol client to re-parse. The transcript projection it used to provide now
 * lives in `transcript-model.ts` as a pure reducer over `AgentSessionUpdate` —
 * a fraction of the code, no second state library, and testable.
 *
 * ## Chrome
 *
 * Silo's own: the same `Breadcrumb` the editor and terminal panels use for the
 * cwd line, the SDK kit for every control, and design tokens for every colour
 * — so a Chat tab and a terminal tab read as the same kind of thing, and both
 * follow the active theme.
 *
 * ## Registration
 *
 * Behind the `chatAgents` setting. The composition root
 * (`apps/desktop/src/builtins.ts`) leaves this extension out of the built-in
 * list while the capability is off, so the panel kind, its `+` menu entry and
 * its command do not exist at all. Once the capability is on, running a
 * *different* Chat UI is the ordinary extension gesture — disable
 * `core.acp-chat` on Settings → Extensions and install the one you want
 * (RFC 0038 acceptance criterion 3).
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
import {
  AgentIconGlyph,
  Badge,
  Button,
  EmptyState,
  Select,
  Textarea,
} from "@silo-code/sdk";
import { Breadcrumb } from "../editor/Breadcrumb";
import { chatProfiles, resolveChatProfile } from "./profile-selection";
import { chatTabActivity } from "./tab-adornment";
import { toAttachment, type Attachment } from "./attachments";
import {
  appendNotice,
  appendUserMessage,
  applyUpdate,
  emptyTranscript,
  stopReasonNotice,
  toolStatusTone,
  type Transcript,
} from "./transcript-model";
import { permissionButtonVariant } from "./permission-options";
import { TranscriptMarkdown } from "./TranscriptMarkdown";
import "./acp-chat.css";

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
  ctx,
}: DockPanelProps<AcpChatPanelParams> & { ctx: ExtensionContext }) {
  const ws = ctx.workspaces.getState();
  const cwd = ws.all.find((w) => w.id === ws.activeId)?.folder ?? "";

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
    setPhase({ status: "connecting" });
    setTranscript(emptyTranscript);
    setPermissions([]);
    setAgentName(undefined);
    // A profile switch mid-turn abandons that turn's `prompt()` promise, whose
    // `finally` sees a different handle and leaves `busy` alone — so clear it
    // here or the composer keeps offering Stop for a session that is gone.
    setBusy(false);
    setLost(false);
    setConfigOptions([]);
    setDeadConfigIds(new Set());
    setAttachments([]);

    void ctx.agents.sessions
      .connect(profileId, {
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
        setConfigOptions(handle.configOptions);
        subs.push(
          handle.onConfigOptionsChanged(() =>
            setConfigOptions(handle.configOptions),
          ),
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
  }, [ctx, profileId, nonce]);

  // The tab label follows what the agent declared about itself. `params.title`
  // is only a **seed** for the label before that is known — whoever opened the
  // panel (the `+` menu's profile list, `core.newAgent.<id>`) supplies the
  // profile's label so the tab is never briefly nameless.
  useEffect(() => {
    api.setTitle(agentName ?? params.title ?? profile?.label ?? "Agent");
  }, [api, params.title, agentName, profile?.label]);

  // Tab parity with a terminal tab (RFC 0038 criterion 1): the Chat tab shows
  // the same activity badge a terminal running this agent would. The agent
  // process dying is not a separate channel — it lands on this session's own
  // `AgentInfo` as `activity: "error"`, so `lost` reads off the same snapshot.
  useEffect(() => {
    const check = (all: readonly AgentInfo[]) => {
      const id = handleRef.current?.id;
      const info = id ? all.find((a) => a.id === id) : undefined;
      setLost(info?.activity === "error");
      // Watching a turn finish counts as having seen it. The host raises
      // attention on every finish (it cannot know whether this panel is on
      // screen); clearing it while visible is what makes a *background* Chat
      // tab badge and a foreground one not — the terminal rule, where focus
      // does the same job. The visibility effect below only fires on a
      // visibility *change*, so a turn ending under an already-visible panel
      // has to be cleared here.
      if (info?.needsAttention && api.isVisible && id)
        ctx.agents.acknowledge(id);
      api.setTabActivity(chatTabActivity(info));
    };
    const sub = ctx.agents.subscribe(check, { allWorkspaces: true });
    check(ctx.agents.getState({ allWorkspaces: true }));
    return () => sub.dispose();
  }, [ctx, api, phase.status]);

  // ...and the same brand icon. Driven imperatively onto this panel's own tab
  // rather than through a host binder — the panel knows its session, so there
  // is no panel-id → agent-id map to invent. `AgentIconGlyph` is *called*, not
  // constructed as JSX: it returns `null` for an unknown agent, and that has
  // to gate whether an icon is set at all (a truthy element descriptor makes
  // the host reserve tab space for an icon that renders nothing).
  useEffect(() => {
    const paint = () => {
      const agentId = handleRef.current?.agentId;
      const iconData = agentId
        ? ctx.agents.catalog().find((c) => c.id === agentId)?.icon
        : undefined;
      const scheme = ctx.theme.resolve(ctx.theme.getState().activeId).base;
      const glyph = AgentIconGlyph({
        icon: iconData,
        mode: "color",
        colorScheme: scheme,
      });
      api.setTabIcon(glyph ? { icon: glyph } : null);
    };
    paint();
    const sub = ctx.theme.subscribe(paint);
    return () => sub.dispose();
  }, [ctx, api, agentName, phase.status]);

  // Looking at the transcript counts as having seen it, so the session's
  // attention badge clears the same way selecting a terminal tab clears one.
  useEffect(() => {
    const acknowledge = () => {
      const id = handleRef.current?.id;
      if (id) ctx.agents.acknowledge(id);
    };
    if (api.isVisible) acknowledge();
    const sub = api.onDidVisibilityChange(({ isVisible }) => {
      if (isVisible) acknowledge();
    });
    return () => sub.dispose();
  }, [ctx, api, phase.status]);

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

  const setConfigOption = useCallback((id: string, value: string) => {
    handleRef.current?.setConfigOption(id, value).catch((err) => {
      setTranscript((t) => appendNotice(t, "error", errorMessage(err)));
      // The agent advertised this control but will not accept a write for it
      // — drop it so the user is not left poking a Select that only errors.
      setDeadConfigIds((prev) => new Set(prev).add(id));
    });
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
      <div className="acp-chat__toolbar">
        <Breadcrumb
          filePath={cwd || null}
          workspaceFolder={cwd}
          leafIcon="folder"
        />
      </div>

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
            lost
              ? "The agent is no longer running."
              : phase.status === "ready"
                ? `Message ${agentName ?? profile?.label ?? "the agent"}…`
                : "Waiting for the agent…"
          }
          disabled={phase.status !== "ready" || lost}
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
            onChange={(e) => {
              // The tab remembers the choice, so reopening it comes back on
              // the same agent. The effect above does the teardown.
              setRequestedId(e.target.value);
              api.updateParameters({ profileId: e.target.value });
            }}
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
                disabled={phase.status !== "ready" || lost}
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
            disabled={phase.status !== "ready" || lost}
            onClick={() => void attachFile()}
          >
            Attach
          </Button>
          {lost ? (
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

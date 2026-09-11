/**
 * `ctx.agents.sessions` — the public surface an extension drives a **Chat
 * session** through (RFC 0038 phase 2).
 *
 * Where `ctx.agents.profiles` *starts a terminal and walks away*, this *holds a
 * live Agent Client Protocol connection*: `connect()` spawns the agent for a
 * user-authored `chat` profile (never an arbitrary command an extension
 * supplies), runs `initialize` + `session/new`, and hands back a
 * {@link AgentSessionHandle} the extension can `prompt`, watch and `cancel`.
 *
 * It also feeds `ctx.agents`: every live session is registered in
 * `chat-agent-registry.ts` as an {@link AgentInfo} with `kind: "chat"`, its
 * `activity` / `needsAttention` derived here from the turn lifecycle — so a
 * Chat session shows up in the Agents navigator with correct status having
 * never touched a terminal.
 *
 * `connect()` needs the `"agents"` {@link Permission}, declared in the calling
 * extension's manifest and granted at install — the way {@link FileService}
 * needs `fs:read`. The factory takes a predicate (`context.ts` binds it to the
 * per-extension permission set) rather than reading a global, so the gate is a
 * capability grant, not a setting (RFC 0039 retired the `chatAgents` flag).
 */

import type {
  AgentCommand,
  AgentContentBlock,
  AgentInfo,
  AgentPermissionRequest,
  AgentPromptBlock,
  AgentPromptCapabilities,
  AgentPromptResult,
  AgentSessionConfigOption,
  AgentSessionConnectOptions,
  AgentSessionHandle,
  AgentSessionUpdate,
  AgentSessionsService,
  ChatResumeState,
  Disposable,
} from "@silo-code/sdk";
import { store } from "../../state/store";
import { getAgentProfiles } from "../../state/agent-profiles";
import { agentsChannel } from "./agents-channel";
import { createAcpTransport } from "./acp-transport";
import { configDirEnvVarForAgent } from "./agent-catalog";
import {
  AcpRpcError,
  capabilityEnabled,
  createAcpClient,
  promptCapabilityEnabled,
  type AcpClient,
  type AcpClientCallbacks,
  type AcpConfigOption,
  type AcpContentBlock,
  type AcpPermissionOutcome,
  type AcpPermissionRequest,
  type AcpSessionUpdate,
} from "./acp-jsonrpc";
import {
  getChatAgentEntry,
  patchChatAgent,
  registerChatAgent,
  removeChatAgent,
  setChatAgentControls,
} from "./chat-agent-registry";
import { getActiveAgentSession } from "./agent-surface-registry";
import { noteChatSessionConfigDir } from "./chat-session-restore";
import {
  parseCommands,
  parseContentBlock,
  parsePlanEntries,
  parseToolCall,
} from "./acp-update-model";
import {
  beginTurn,
  endTurn,
  type TurnOutcome,
  type TurnPhase,
} from "./agent-turn-model";
import {
  createJournalWriter,
  parseJournalLines,
  readJournalLines,
  type ChatSessionJournalWriter,
} from "./chat-session-journal";
import { sessionConfigToApply } from "./profile-session-config";

/** How long `dispose()` gives `session/close` to land before killing the
 *  process regardless (RFC 0042: "call session/close, then kill the
 *  process" — but a hung close must never leak the child). */
const SESSION_CLOSE_TIMEOUT_MS = 2000;

const TEXT_KINDS = new Set([
  "agent_message_chunk",
  "agent_thought_chunk",
  "user_message_chunk",
]);

function nowIso(): string {
  return new Date().toISOString();
}

function toAcpBlocks(blocks: readonly AgentPromptBlock[]): AcpContentBlock[] {
  return blocks.map((b) => {
    if (b.type === "text") return { type: "text", text: b.text };
    if (b.type === "resource")
      return {
        type: "resource",
        resource: {
          uri: b.uri,
          text: b.text,
          ...(b.mimeType ? { mimeType: b.mimeType } : {}),
        },
      };
    return {
      type: "resource_link",
      uri: b.uri,
      ...(b.name ? { name: b.name } : {}),
    };
  });
}

/** `initialize`'s `promptCapabilities`, normalised so a missing field (Claude
 *  and codex both omit `audio`) reads as `false` rather than `undefined` —
 *  RFC 0040. */
function toSdkPromptCapabilities(
  raw: { image?: unknown; audio?: unknown; embeddedContext?: unknown } = {},
): AgentPromptCapabilities {
  return {
    image: promptCapabilityEnabled(raw.image),
    audio: promptCapabilityEnabled(raw.audio),
    embeddedContext: promptCapabilityEnabled(raw.embeddedContext),
  };
}

function toSdkConfigOptions(
  opts: readonly AcpConfigOption[],
): AgentSessionConfigOption[] {
  return opts.map((o) => ({
    id: o.id,
    name: o.name,
    ...(o.description ? { description: o.description } : {}),
    category: o.category,
    type: o.type,
    currentValue: o.currentValue,
    options: o.options.map((c) => ({
      value: c.value,
      name: c.name,
      ...(c.description ? { description: c.description } : {}),
    })),
  }));
}

/** The new selected value carried by a `current_mode_update` notification —
 *  read defensively since the exact field is not nailed down in recon. */
function currentModeFromUpdate(u: AcpSessionUpdate): string | undefined {
  for (const key of ["currentModeId", "currentValue", "modeId"] as const) {
    const v = (u as Record<string, unknown>)[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

/**
 * The title an agent volunteered in a `session_info_update`.
 *
 * This is the Chat analogue of an OSC window title, and just as optional:
 * Cursor sends a generated summary of the turn, and so does `claude-agent-acp`
 * as of 0.75.1 — the 2026-09-08 recon found Claude sending none, so treat
 * "which agents volunteer a title" as a fact about the agent *and its adapter
 * version*, never something to branch on. Read across the shapes the
 * notification has been seen in (top-level, or nested under an info object)
 * rather than pinning one, the same tolerance the update stream applies to
 * unknown kinds.
 */
function titleFromSessionInfo(u: AcpSessionUpdate): string | undefined {
  const record = u as Record<string, unknown>;
  const direct = record.title;
  if (typeof direct === "string" && direct.trim().length > 0)
    return direct.trim();
  for (const key of ["info", "sessionInfo"] as const) {
    const nested = record[key];
    if (nested && typeof nested === "object") {
      const t = (nested as Record<string, unknown>).title;
      if (typeof t === "string" && t.trim().length > 0) return t.trim();
    }
  }
  return undefined;
}

/**
 * Project one wire frame onto the SDK's update.
 *
 * The rule this encodes: **everything a Chat UI must render is a modelled
 * field** (RFC 0038 phase 3.8). `raw` rides along for the kinds deliberately
 * left unmodelled, never as the way to read a tool call or the plan.
 */
function toSdkUpdate(u: AcpSessionUpdate): AgentSessionUpdate {
  const kind = u.sessionUpdate;
  let text: string | undefined;
  let content: AgentContentBlock | undefined;
  if (TEXT_KINDS.has(kind)) {
    content = parseContentBlock(u.content);
    if (typeof content?.text === "string") text = content.text;
  }
  const toolCall =
    kind === "tool_call" || kind === "tool_call_update"
      ? parseToolCall(u)
      : undefined;
  const plan = kind === "plan" ? parsePlanEntries(u.entries) : undefined;
  return {
    kind,
    text,
    ...(content ? { content } : {}),
    messageId:
      typeof u.messageId === "string" ? (u.messageId as string) : undefined,
    ...(toolCall ? { toolCall } : {}),
    ...(plan ? { plan } : {}),
    raw: u as Readonly<Record<string, unknown>>,
  };
}

/**
 * Synthesize a `user_message_chunk`-shaped update for the **transcript
 * journal** (RFC 0042) when a turn is sent.
 *
 * The live update stream never echoes the user's own prompt back (a Chat UI
 * appends it locally the moment it sends — see
 * `transcript-model.ts`'s `appendUserMessage`), so a journal built only from
 * `onUpdate` would silently drop half of every conversation that never went
 * through a `session/load` replay (replay *does* re-send `user_message_chunk`
 * — recon §5.2 — which is the one case this would otherwise duplicate; it
 * never fires here because the writer is seeded empty for a `load` restore).
 * `undefined` for a turn with no text block (attachment-only) — nothing
 * honest to show for it.
 */
function journalUserPromptUpdate(
  blocks: readonly AgentPromptBlock[],
  messageId: string,
): AgentSessionUpdate | undefined {
  const text = blocks
    .filter(
      (b): b is Extract<AgentPromptBlock, { type: "text" }> =>
        b.type === "text",
    )
    .map((b) => b.text)
    .join("");
  if (!text) return undefined;
  return {
    kind: "user_message_chunk",
    text,
    content: { type: "text", text },
    messageId,
    raw: { synthesized: true },
  };
}

/** The outcome of {@link tryResumeOrLoad}. */
type ResumeAttempt =
  | { via: "resume"; sessionId: string; configOptions: AcpConfigOption[] }
  | { via: "load"; sessionId: string; configOptions: AcpConfigOption[] }
  | { via: "none" };

/**
 * Probe `session/resume` and `session/load` **separately**, `resume` winning
 * when both are advertised (RFC 0042 — fast, no replay, the ACP v2 path).
 * Shared by {@link createAgentSessionsService}'s restore-on-connect flow and
 * its in-place `ctx.agents.resume(id)` control — the same two calls, on
 * whichever `AcpClient` the caller is trying them against.
 */
async function tryResumeOrLoad(
  client: AcpClient,
  caps: { resume: boolean; load: boolean },
  sessionId: string,
  cwd: string,
  label: string,
): Promise<ResumeAttempt> {
  // Which of the two ran, and whether it worked, is the first thing anyone
  // debugging a restore needs — and the only place the difference is visible
  // (both end in the same `"resumed"` state). Capability *detection* is the
  // part that has been wrong before: an agent advertising `resume: {}` was
  // read as not supporting it at all, silently routing every restore through
  // `session/load`.
  agentsChannel.debug(
    `[${label}] restoring ${sessionId} — resume ${caps.resume ? "advertised" : "not advertised"}, load ${caps.load ? "advertised" : "not advertised"}`,
  );
  if (caps.resume) {
    try {
      const r = await client.resumeSession(sessionId, cwd);
      agentsChannel.info(`Restored ${sessionId} via session/resume.`);
      return { via: "resume", sessionId, configOptions: r.configOptions };
    } catch (err) {
      agentsChannel.debug(
        `[${label}] session/resume failed for ${sessionId}: ${asError(err, "").message}`,
      );
    }
  }
  if (caps.load) {
    try {
      const r = await client.loadSession(sessionId, cwd);
      agentsChannel.info(`Restored ${sessionId} via session/load.`);
      return {
        via: "load",
        sessionId: r.sessionId,
        configOptions: r.configOptions,
      };
    } catch (err) {
      agentsChannel.debug(
        `[${label}] session/load failed for ${sessionId}: ${asError(err, "").message}`,
      );
    }
  }
  return { via: "none" };
}

/**
 * @internal — host factory; extensions receive this as `ctx.agents.sessions`.
 *
 * @param hasAgentsPermission - `true` when the calling extension declared the
 *   `"agents"` {@link Permission}. `connect()` throws without it.
 */
export function createAgentSessionsService(
  hasAgentsPermission: () => boolean,
): AgentSessionsService {
  return {
    async connect(
      profileId: string,
      options?: AgentSessionConnectOptions,
    ): Promise<AgentSessionHandle> {
      if (!hasAgentsPermission()) {
        throw new Error(
          'ctx.agents.sessions.connect() needs the "agents" permission — add it to your extension\'s silo.permissions.',
        );
      }
      const profile = getAgentProfiles().find((p) => p.id === profileId);
      if (!profile) {
        throw new Error(`No agent profile with id "${profileId}".`);
      }
      if (profile.launch.interface !== "chat") {
        throw new Error(
          `Agent profile "${profile.label}" is a Terminal profile — ctx.agents.sessions connects Chat profiles only.`,
        );
      }
      const launch = profile.launch;
      const label = profile.label;

      // `||`, not `??`: a caller that has no workspace to name passes an empty
      // string as readily as it omits the field (a dock panel reads its own
      // from the host, which answers `""` for a dock whose registration has not
      // landed yet), and treating that as an explicit choice fails the connect
      // outright rather than falling back to the active workspace.
      const workspaceId = options?.workspaceId || store.activeWorkspaceId || "";
      const workspace = store.workspaces[workspaceId];
      if (!workspace) {
        throw new Error("No workspace to connect the Chat session in.");
      }
      const cwd = options?.cwd ?? workspace.folder;
      const assumedAgentId = profile.assumedAgentId;
      const resumeTarget = options?.resume;

      // A restore has an identity before it has a connection: `initialize`
      // alone measured 3.7–6.5s live (2026-09-09 verification) with the SDK
      // bootstrap dominating that, well before `resume`/`load` even starts.
      // Register what's already known — the persisted title (RFC 0042's own
      // `ChatPanelState`, surfaced through `options.title`), the profile, the
      // sessionId — right away, so the dock tab, the workspace row and the
      // Agents navigator show the *last known* identity instantly instead of
      // the profile-label fallback for however long reconnecting takes.
      // Superseded the moment the real registration lands, under the same id
      // in the common case (`registerChatAgent` overwrites in place) or
      // explicitly removed below when the id changes or the attempt fails.
      // The registry id this session is filed under. Empty until there is an
      // identity to file: a restore has one from the start (the placeholder
      // below), a fresh connect not until `session/new` names it.
      let infoId = "";
      // A title the agent volunteered *during this connect* (a
      // `session_info_update`, typically inside a `session/load` replay). It
      // outranks anything persisted, and is tracked here because the
      // `patchChatAgent` that applies it can land before the real
      // registration does — which would then overwrite it.
      let volunteeredTitle: string | undefined;
      // The last title this session was seen under, as Silo itself recorded it
      // (`AppState.chatSessionState` — the same status the Agents navigator
      // lists a dormant session from). A backstop for `options.title`: the
      // caller's copy lives in its panel's persisted state and can go missing
      // where the host's cannot, and a restored session showing the profile
      // label is exactly the regression this whole path exists to prevent.
      // Both halves apply to a restore only — a fresh session has no prior
      // title, and `options.title` is documented as ignored without `resume`.
      const restoredTitle = resumeTarget
        ? (options?.title ??
          store.chatSessionState[`chat:${resumeTarget.sessionId}`]?.title)
        : undefined;
      let placeholderId: string | null = null;
      if (resumeTarget) {
        placeholderId = `chat:${resumeTarget.sessionId}`;
        // The placeholder is a *real* registration, so `infoId` names it for
        // the whole handshake: an agent that talks while `resume`/`load` is
        // still in flight (a replay's `session_info_update`, a permission
        // request) would otherwise patch the empty-string id and be dropped —
        // the same in-flight ordering that lost the journal's replay lines.
        infoId = placeholderId;
        registerChatAgent({
          id: placeholderId,
          workspaceId,
          title: restoredTitle ?? label,
          kind: "chat",
          isAgent: true,
          activity: "idle",
          needsAttention: false,
          stale: false,
          canResume: false,
          sessionId: resumeTarget.sessionId,
          agentId: assumedAgentId,
          chatResumeState: "resuming",
        });
      }

      // --- listener + connection state -----------------------------------
      const updateListeners = new Set<(u: AgentSessionUpdate) => void>();
      const permissionListeners = new Set<
        (r: AgentPermissionRequest) => void
      >();
      const configListeners = new Set<() => void>();
      const commandListeners = new Set<() => void>();
      let disposed = false;
      // The **live RPC** session id — empty when `resumeOutcome` is
      // `"journal-only"` (no live connection to send it to). See
      // `persistSessionId` for what a caller should actually persist.
      let acpSessionId = "";
      // Whether there is a live agent connection to prompt/cancel at all —
      // false only for a `"journal-only"` handle (RFC 0042).
      let liveConnection = true;
      let journalWriter: ChatSessionJournalWriter | null = null;
      let userMsgSeq = 0;
      // Live snapshot: the handle exposes it through a getter, and both
      // `setConfigOption` and a `current_mode_update` the agent sends itself
      // replace it (immutably) and fire `configListeners`.
      let configOptions: AgentSessionConfigOption[] = [];
      // Live snapshot, same shape: empty until the agent's first
      // `available_commands_update` (RFC 0040) — `connect()` does not wait
      // for it, since nothing in the protocol requires an agent to ever send
      // one.
      let commands: readonly AgentCommand[] = [];

      function fireConfigChanged(): void {
        for (const l of configListeners) {
          try {
            l();
          } catch (err) {
            agentsChannel.debug(
              `chat session onConfigOptionsChanged listener threw: ${err}`,
            );
          }
        }
      }

      function fireCommandsChanged(): void {
        for (const l of commandListeners) {
          try {
            l();
          } catch (err) {
            agentsChannel.debug(
              `chat session onCommandsChanged listener threw: ${err}`,
            );
          }
        }
      }

      // The turn lifecycle goes through the one shared core
      // (`agent-turn-model.ts`) — the same functions the terminal reducer
      // calls once it has resolved the ambiguity of detection. A Chat session
      // has no ambiguity to resolve, so it calls in directly.
      //
      // `witnessed` is the whole reason `DockPanelApi.setAgentSession` exists:
      // the host can now tell whether the user is looking at *this session's*
      // tab, so a finish they watched raises no badge and one they did not
      // does — with no help from the panel. Before that, the panel had to
      // acknowledge itself on becoming visible, which is a consumer
      // reimplementing a host rule.
      function currentPhase(): TurnPhase {
        const info = getChatAgentEntry(infoId)?.info;
        return {
          activity: info?.activity ?? "idle",
          needsAttention: info?.needsAttention ?? false,
          attentionSince: info?.attentionSince ?? null,
          workingSince: info?.workingSince ?? null,
        };
      }

      function applyPhase(phase: TurnPhase): void {
        patchChatAgent(infoId, {
          activity: phase.activity,
          needsAttention: phase.needsAttention,
          attentionSince: phase.attentionSince ?? undefined,
          workingSince: phase.workingSince ?? undefined,
        });
      }

      function finishTurn(outcome: TurnOutcome): void {
        applyPhase(
          endTurn(currentPhase(), {
            now: nowIso(),
            isAgent: true,
            witnessed: getActiveAgentSession() === infoId,
            outcome,
          }),
        );
      }

      const callbacks: AcpClientCallbacks = {
        onUpdate(update) {
          // The agent's slash-command / skill list (RFC 0040) — a live
          // snapshot, replaced wholesale each time exactly like `configOptions`.
          if (update.sessionUpdate === "available_commands_update") {
            commands = parseCommands(update.availableCommands);
            fireCommandsChanged();
          }
          // The agent moved its own mode (e.g. a slash-command). Reflect it in
          // the `mode` config option so a bound Select is never stale.
          if (update.sessionUpdate === "current_mode_update") {
            const next = currentModeFromUpdate(update);
            const idx = configOptions.findIndex((o) => o.category === "mode");
            if (next && idx >= 0 && configOptions[idx].currentValue !== next) {
              configOptions = configOptions.map((o, i) =>
                i === idx ? { ...o, currentValue: next } : o,
              );
              fireConfigChanged();
            }
          }
          // The agent volunteered a label for the conversation. One signal,
          // many consumers: it lands on `AgentInfo.title`, and the dock tab,
          // the workspace status row and the navigator row all read it back
          // from there rather than each deriving their own string.
          if (update.sessionUpdate === "session_info_update") {
            const title = titleFromSessionInfo(update);
            if (title) {
              volunteeredTitle = title;
              patchChatAgent(infoId, { title });
            }
          }
          const sdk = toSdkUpdate(update);
          // Journal every update that arrives — live turns and a `load`'s own
          // replay alike (RFC 0042). The writer is seeded to avoid duplicating
          // a `load` replay against what was already on disk; see the
          // handshake below.
          journalWriter?.append(sdk);
          for (const l of updateListeners) {
            try {
              l(sdk);
            } catch (err) {
              agentsChannel.debug(
                `chat session onUpdate listener threw: ${err}`,
              );
            }
          }
        },
        onPermission(request, respond) {
          if (disposed) {
            respond({ outcome: "cancelled" });
            return;
          }
          // A blocked turn wants attention on the same terms a finished one
          // does: only if nobody is looking at this session's surface. The
          // user staring at the permission row does not need to be told.
          if (getActiveAgentSession() !== infoId) {
            patchChatAgent(infoId, {
              needsAttention: true,
              attentionSince: nowIso(),
            });
          }
          // No extension listener → answer cancelled so the agent isn't hung.
          // The pending turn still resolves and re-evaluates attention.
          if (permissionListeners.size === 0) {
            respond({ outcome: "cancelled" });
            return;
          }
          const sdkReq = toSdkPermission(request, (outcome) => {
            respond(outcome);
            patchChatAgent(infoId, {
              needsAttention: false,
              attentionSince: undefined,
            });
          });
          for (const l of permissionListeners) {
            try {
              l(sdkReq);
            } catch (err) {
              agentsChannel.debug(
                `chat session onPermission listener threw: ${err}`,
              );
            }
          }
        },
        onClosed() {
          if (disposed) return;
          // A dead process is `activity: "error"` — a state every consumer
          // renders loudly on its own, so the shared core deliberately leaves
          // attention alone rather than stacking a second signal on it. Same
          // as a Terminal session's error.
          finishTurn("failed");
        },
        onLog(line) {
          agentsChannel.debug(`[${label}] ${line}`);
        },
      };

      // An agent CLI keeps its sessions inside its **config directory**, which
      // it reads from an env var (`CLAUDE_CONFIG_DIR`, `CODEX_HOME`, …). Silo
      // inherits that variable from whatever environment it was launched in,
      // so a session created by an app started from one shell is invisible to
      // the same app started from another — it looks in a different store and
      // reports the session as gone. Caught live (2026-09-10): a real
      // conversation was declared unresumable purely because the dev app had
      // been relaunched from a shell that exported a different config dir.
      //
      // So the store is part of a session's identity: whatever the child
      // actually got at creation is persisted, and every later restore is
      // spawned against that same value rather than against the ambient one.
      const configDirVar = configDirEnvVarForAgent(assumedAgentId);
      const pinnedConfigDir = resumeTarget
        ? store.chatSessionState[`chat:${resumeTarget.sessionId}`]?.configDir
        : undefined;
      const spawnEnv: Record<string, string> | undefined =
        configDirVar && pinnedConfigDir
          ? { ...launch.env, [configDirVar]: pinnedConfigDir }
          : launch.env;
      // The value the child is actually running with, reported by the spawn.
      let effectiveConfigDir: string | undefined = pinnedConfigDir;

      function newClient(): AcpClient {
        return createAcpClient(
          createAcpTransport({
            command: launch.command,
            args: launch.args,
            cwd,
            env: spawnEnv,
            reportEnv: configDirVar ? [configDirVar] : undefined,
            onEnvReport: (values) => {
              if (!configDirVar) return;
              const value = values[configDirVar];
              if (value) effectiveConfigDir = value;
            },
            onStderr: (line) => agentsChannel.debug(`[${label}] ${line}`),
          }),
          callbacks,
        );
      }

      // --- initial handshake -------------------------------------------------
      let client = newClient();
      let init;
      try {
        init = await client.initialize();
      } catch (err) {
        client.dispose();
        if (placeholderId) removeChatAgent(placeholderId);
        throw asError(err, `Could not start ${label}`);
      }

      // Every capability is read through `capabilityEnabled`: agents send both
      // shapes (`true` and a details object), and the details object is what
      // the catalog's most-used adapter actually sends.
      const canLoadSession = capabilityEnabled(
        init.agentCapabilities?.loadSession,
      );
      const canResumeCap = capabilityEnabled(init.sessionCapabilities?.resume);
      const canCloseCap = capabilityEnabled(init.sessionCapabilities?.close);
      const resumeCaps = { resume: canResumeCap, load: canLoadSession };
      // Read once, fixed for the session's life (RFC 0040) — unlike
      // `configOptions` / `commands`, nothing renegotiates this mid-session.
      const promptCapabilities = toSdkPromptCapabilities(
        init.promptCapabilities,
      );

      async function startFreshSession(): Promise<{
        sessionId: string;
        configOptions: AcpConfigOption[];
      }> {
        try {
          const s = await client.newSession(cwd);
          return {
            sessionId: s.sessionId,
            configOptions: s.configOptions ?? [],
          };
        } catch (err) {
          client.dispose();
          if (placeholderId) removeChatAgent(placeholderId);
          // `session/new` failing is the real "auth required" signal (recon
          // §5f) — and also how a vendor deprecation surfaces (recon Finding 5).
          // The agent's own message is on the AcpRpcError.
          throw asError(
            err,
            `${label} could not start a session (it may need you to sign in first)`,
          );
        }
      }

      // --- restore flow: resume → load → journal (RFC 0042) -----------------
      let session: { sessionId: string; configOptions: AcpConfigOption[] };
      let resumeOutcome: "new" | "resumed" | "journal-only" = "new";
      let persistSessionId: string;

      if (!resumeTarget) {
        session = await startFreshSession();
        acpSessionId = session.sessionId;
        persistSessionId = session.sessionId;
        journalWriter = createJournalWriter(workspaceId, persistSessionId, []);
      } else if (resumeTarget.startFresh) {
        // "Continue in a new session" from a prior `"journal-only"` handle —
        // the agent is already known not to support `resume`/`load` for this
        // conversation, so go straight to `session/new`, carrying the old
        // journal into the new session's file (RFC 0042 open question 2:
        // continue the same transcript rather than starting a blank one).
        //
        // Adopt the *new* id as `persistSessionId` — caught live (2026-09-09):
        // keeping the dead original id "for continuity" instead means every
        // future restore keeps retrying an id the agent has never heard of
        // and will never resume, even while the live conversation under the
        // new id works turn after turn. Re-key the journal to match, the same
        // way a `session/load` id-adoption already does below.
        const priorLines = await readJournalLines(
          workspaceId,
          resumeTarget.sessionId,
        );
        let writer = createJournalWriter(
          workspaceId,
          resumeTarget.sessionId,
          priorLines,
        );
        session = await startFreshSession();
        acpSessionId = session.sessionId;
        persistSessionId = session.sessionId;
        if (session.sessionId !== resumeTarget.sessionId) {
          const captured = writer.snapshotLines();
          writer.dispose();
          writer = createJournalWriter(
            workspaceId,
            session.sessionId,
            captured,
          );
          void writer.flush();
        }
        journalWriter = writer;
      } else {
        const priorLines = await readJournalLines(
          workspaceId,
          resumeTarget.sessionId,
        );
        // Created **before** the resume/load call, not after: a replay's own
        // `session/update`s stream in while that call is in flight and reach
        // `callbacks.onUpdate` well before this function sees the result — a
        // writer created only afterward silently misses every one of them.
        // (Caught live in RFC 0042 Phase 1 verification, 2026-09-09 — a
        // restored `claude` session came back with an empty transcript.)
        journalWriter = createJournalWriter(
          workspaceId,
          resumeTarget.sessionId,
          priorLines,
        );
        const attempt = await tryResumeOrLoad(
          client,
          resumeCaps,
          resumeTarget.sessionId,
          cwd,
          label,
        );
        if (attempt.via !== "none") {
          session = {
            sessionId: attempt.sessionId,
            configOptions: attempt.configOptions,
          };
          acpSessionId = attempt.sessionId;
          persistSessionId = attempt.sessionId;
          resumeOutcome = "resumed";
          if (attempt.via === "load") {
            // `session/load` replays the whole transcript itself (recon
            // §5.2), captured live into the writer above, appended after the
            // seed — drop the seed so the restore doesn't show every turn
            // twice. Re-key to an adopted id (observed on claude) so future
            // writes — and the next restore attempt — target the live id.
            journalWriter.dropSeed(priorLines.length);
            if (attempt.sessionId !== resumeTarget.sessionId) {
              const captured = journalWriter.snapshotLines();
              journalWriter.dispose();
              journalWriter = createJournalWriter(
                workspaceId,
                attempt.sessionId,
                captured,
              );
              void journalWriter.flush();
            }
          }
        } else if (priorLines.length > 0) {
          // Neither capability worked, but there is a journal: journal-only.
          // No live session to hold open — free the process it never used.
          // `journalWriter` stays as created above (seeded with priorLines;
          // nothing else was ever going to arrive on a connection this dead).
          client.dispose();
          session = { sessionId: resumeTarget.sessionId, configOptions: [] };
          acpSessionId = "";
          persistSessionId = resumeTarget.sessionId;
          resumeOutcome = "journal-only";
          liveConnection = false;
        } else {
          // Nothing to restore at all (a stale id with no journal either) —
          // never refuse to open the panel; fall through to a fresh session.
          // The writer created above was for that dead, journal-less id —
          // drop it (nothing to lose) and start clean under the fresh one.
          journalWriter.dispose();
          session = await startFreshSession();
          acpSessionId = session.sessionId;
          persistSessionId = session.sessionId;
          journalWriter = createJournalWriter(
            workspaceId,
            persistSessionId,
            [],
          );
        }
      }

      infoId = `chat:${acpSessionId || persistSessionId}`;
      // The common case overwrites the placeholder in place (`registerChatAgent`
      // replaces by id); this only fires when the id moved out from under it —
      // a `session/load` adoption, or the journal-less fallback to a brand new
      // `session/new` — leaving the placeholder as a dangling phantom entry.
      if (placeholderId && placeholderId !== infoId)
        removeChatAgent(placeholderId);
      configOptions = toSdkConfigOptions(session.configOptions ?? []);
      const canResume = canLoadSession || canResumeCap;
      const agentName = init.agentInfo?.title ?? init.agentInfo?.name ?? label;
      const journal = parseJournalLines(journalWriter.snapshotLines());

      const chatResumeState: ChatResumeState =
        resumeOutcome === "resumed"
          ? "resumed"
          : resumeOutcome === "journal-only"
            ? "journal-only"
            : "live";

      const baseInfo: AgentInfo = {
        id: infoId,
        workspaceId,
        // The `AgentInfo.title` fallback, in full: a title the agent
        // volunteered during *this* connect (step 1 — a `session_info_update`,
        // which for a `session/load` arrives mid-handshake, before this
        // registration), else the last title this session showed before the
        // app closed (step 2 — `options.title`, out of the panel's persisted
        // state), else the user's own profile label (step 3). Deliberately
        // *not* `agentName`: for an adapter that is the adapter's product name
        // ("pi ACP adapter", "Claude Agent"), which the user never chose and
        // which just leaks the implementation. This also matches the
        // placeholder registration above. `agentName` still rides along as its
        // own field for a consumer that wants the declared name. Reaching for
        // `agentName` here is what made a restored tab snap from its real title
        // back to "Claude Agent" the moment the handshake finished (caught
        // live, 2026-09-09).
        title: volunteeredTitle ?? restoredTitle ?? label,
        kind: "chat",
        isAgent: true,
        activity: resumeOutcome === "journal-only" ? "dead" : "idle",
        needsAttention: false,
        stale: false,
        canResume,
        sessionId: persistSessionId,
        agentName,
        agentId: assumedAgentId,
        chatResumeState,
      };

      async function resume(): Promise<void> {
        if (disposed || !liveConnection) return;
        const next = newClient();
        // `journalWriter` has been listening since this handle was created —
        // a replay lands on it live, appended after whatever it already
        // held, so a `load` outcome needs to drop exactly that much back off.
        const linesBeforeResume = journalWriter?.snapshotLines().length ?? 0;
        try {
          await next.initialize();
          const attempt = await tryResumeOrLoad(
            next,
            resumeCaps,
            acpSessionId,
            cwd,
            label,
          );
          if (attempt.via === "none") {
            throw new Error(`${label} could not resume or load the session`);
          }
          if (attempt.via === "load" && journalWriter) {
            journalWriter.dropSeed(linesBeforeResume);
            if (attempt.sessionId !== acpSessionId) {
              const captured = journalWriter.snapshotLines();
              journalWriter.dispose();
              journalWriter = createJournalWriter(
                workspaceId,
                attempt.sessionId,
                captured,
              );
              void journalWriter.flush();
            }
          }
          client.dispose();
          client = next;
          acpSessionId = attempt.sessionId;
          persistSessionId = attempt.sessionId;
          configOptions = toSdkConfigOptions(attempt.configOptions ?? []);
          fireConfigChanged();
        } catch (err) {
          next.dispose();
          agentsChannel.info(
            `Could not resume chat session ${infoId}: ${asError(err, "resume failed").message}`,
          );
          return;
        }
        patchChatAgent(infoId, {
          activity: "idle",
          needsAttention: false,
          attentionSince: undefined,
          sessionId: acpSessionId,
          chatResumeState: "resumed",
        });
      }

      // `reveal` is the extension's own "come to the front" — a dock panel
      // calls `api.setActive()`. Wrapped so a throwing callback cannot break
      // `ctx.agents.reveal`, which the navigator calls on a click.
      const revealFromExtension = options?.reveal;
      const reveal = revealFromExtension
        ? () => {
            try {
              revealFromExtension();
            } catch (err) {
              agentsChannel.debug(
                `chat session ${infoId} reveal callback threw: ${err}`,
              );
            }
          }
        : undefined;

      registerChatAgent(baseInfo, {
        reveal,
        resume: canResume ? resume : undefined,
      });
      // Stamp the store this session lives in onto its persisted status, now
      // that it has one — every later restore spawns against this value rather
      // than whatever Silo happens to have inherited that day.
      noteChatSessionConfigDir(infoId, effectiveConfigDir);
      agentsChannel.info(
        `Chat session ${infoId} connected (${agentName}${canResume ? ", resumable" : ""}).`,
      );

      const handle: AgentSessionHandle = {
        id: infoId,
        // A getter, not a plain field: an in-place `resume()` (`ctx.agents.
        // resume(id)`) can adopt a new id from `session/load` after this
        // handle was returned, and this always reads the current one.
        get sessionId(): string {
          return persistSessionId;
        },
        agentId: assumedAgentId,
        agentName,
        canResume,
        resumeOutcome,
        journal,

        async prompt(
          blocks: readonly AgentPromptBlock[],
        ): Promise<AgentPromptResult> {
          if (!liveConnection) {
            throw new Error(
              `${label} is journal-only — reconnect with resume: { sessionId, startFresh: true } to continue.`,
            );
          }
          applyPhase(beginTurn(currentPhase(), nowIso()));
          // The stream never echoes the user's own prompt back (see
          // `journalUserPromptUpdate`'s doc comment) — journal it directly so
          // a `resume`/journal-only restore still shows what was asked.
          const journalUpdate = journalUserPromptUpdate(
            blocks,
            `silo-journal-user-${++userMsgSeq}`,
          );
          if (journalUpdate) journalWriter?.append(journalUpdate);
          // `session/prompt` itself is otherwise unlogged: an agent that
          // silently retries and gives up *inside* its own turn (no JSON-RPC
          // error, `stopReason: "end_turn"` either way) leaves nothing in this
          // channel to diagnose from — only the transcript, which shows
          // whatever prose the agent chose to print. The duration is the one
          // signal Silo can add for free: a turn that took many times longer
          // than usual is the tell, even when the agent reports success.
          const startedAt = Date.now();
          try {
            const { stopReason } = await client.prompt(
              acpSessionId,
              toAcpBlocks(blocks),
            );
            agentsChannel.debug(
              `[${label}] session/prompt for ${persistSessionId} finished (${stopReason}) in ${Date.now() - startedAt}ms.`,
            );
            finishTurn(stopReason === "cancelled" ? "cancelled" : "finished");
            return { stopReason };
          } catch (err) {
            if (!disposed) finishTurn("failed");
            agentsChannel.debug(
              `[${label}] session/prompt failed for ${persistSessionId} after ${Date.now() - startedAt}ms: ${asError(err, "").message}`,
            );
            throw asError(err, "The prompt turn failed");
          }
        },

        cancel(): void {
          if (!liveConnection) return;
          client.cancel(acpSessionId);
        },

        get configOptions(): readonly AgentSessionConfigOption[] {
          return configOptions;
        },

        async setConfigOption(id: string, value: string): Promise<void> {
          const option = configOptions.find((o) => o.id === id);
          if (!option) {
            throw new Error(`No session config option "${id}".`);
          }
          if (!option.options.some((c) => c.value === value)) {
            throw new Error(`"${value}" is not a choice for "${option.name}".`);
          }
          if (option.currentValue === value) return;
          // **Generic write first.** `session/set_config_option` is what the
          // protocol pairs with the generic `configOptions` list, and both
          // probed agents implement it for every category they advertise —
          // including `thought_level`, which has no typed method at all. An
          // earlier probe concluded it was broken by passing `optionId`; the
          // parameter is `configId`.
          //
          // The typed `set_mode` / `set_model` are the fallback, for an agent
          // that answers `-32601`. Category dispatch is a last resort, not the
          // design: it can only ever cover the categories Silo has hard-coded,
          // which is exactly the coupling `configOptions` exists to remove.
          let updated: AcpConfigOption[] | null = null;
          try {
            updated = await client.setConfigOption(acpSessionId, id, value);
          } catch (err) {
            if (!(err instanceof AcpRpcError) || err.code !== -32601) throw err;
            agentsChannel.debug(
              `[${label}] no generic set_config_option; falling back to the typed setter for "${option.category}"`,
            );
            if (option.category === "mode") {
              await client.setMode(acpSessionId, value);
            } else if (option.category === "model") {
              await client.setModel(acpSessionId, value);
            } else {
              throw new Error(
                `${label} has no way to set "${option.name}" (category "${
                  option.category || "(none)"
                }").`,
              );
            }
          }
          // The agent echoes the whole updated list back — prefer it over a
          // local patch, since setting one option can move another (Cursor's
          // model values encode effort/context, Claude's mode gates edits).
          configOptions =
            updated !== null
              ? toSdkConfigOptions(updated)
              : configOptions.map((o) =>
                  o.id === id ? { ...o, currentValue: value } : o,
                );
          fireConfigChanged();
        },

        onConfigOptionsChanged(listener: () => void): Disposable {
          configListeners.add(listener);
          return { dispose: () => configListeners.delete(listener) };
        },

        get commands(): readonly AgentCommand[] {
          return commands;
        },

        onCommandsChanged(listener: () => void): Disposable {
          commandListeners.add(listener);
          return { dispose: () => commandListeners.delete(listener) };
        },

        promptCapabilities,

        onUpdate(listener: (update: AgentSessionUpdate) => void): Disposable {
          updateListeners.add(listener);
          return { dispose: () => updateListeners.delete(listener) };
        },

        onPermission(
          listener: (request: AgentPermissionRequest) => void,
        ): Disposable {
          permissionListeners.add(listener);
          return { dispose: () => permissionListeners.delete(listener) };
        },

        dispose(): void {
          if (disposed) return;
          disposed = true;
          const writer = journalWriter;
          journalWriter = null;
          const finishTeardown = () => {
            client.dispose();
            void writer?.flush().finally(() => writer?.dispose());
          };
          // Clean teardown (not a crash — `onClosed` never reaches here):
          // `session/close` first, so the agent can free its own resources,
          // then kill the process (RFC 0042). Best-effort and time-boxed — a
          // hung `session/close` must never leak the child.
          if (liveConnection && canCloseCap) {
            void Promise.race([
              client.closeSession(acpSessionId).catch(() => {}),
              new Promise<void>((r) => setTimeout(r, SESSION_CLOSE_TIMEOUT_MS)),
            ]).finally(finishTeardown);
          } else {
            finishTeardown();
          }
          removeChatAgent(infoId);
          updateListeners.clear();
          permissionListeners.clear();
          configListeners.clear();
          commandListeners.clear();
          agentsChannel.info(`Chat session ${infoId} disposed.`);
        },
      };

      // Hand the registry the teardown too, now that `handle` exists — this is
      // how `WorkspaceService.delete()` reaps a live session (via
      // `reapWorkspaceChatSessions`) instead of waiting for the panel to
      // unmount. `dispose()` is idempotent, so a later panel unmount is a
      // no-op. An in-place `resume()` reassigns `client` inside this closure,
      // so the bound `handle.dispose` stays correct across it.
      setChatAgentControls(infoId, {
        reveal,
        resume: canResume ? resume : undefined,
        dispose: () => handle.dispose(),
      });

      // Profile defaults apply only on a fresh session — a resumed one already
      // carries whatever the agent had when it was last open.
      if (
        resumeOutcome === "new" &&
        liveConnection &&
        launch.sessionConfig &&
        Object.keys(launch.sessionConfig).length > 0
      ) {
        for (const { id, value } of sessionConfigToApply(
          launch.sessionConfig,
          configOptions,
        )) {
          try {
            await handle.setConfigOption(id, value);
          } catch (err) {
            agentsChannel.debug(
              `[${label}] could not apply profile default "${id}=${value}": ${asError(err, "").message}`,
            );
          }
        }
      }

      return handle;
    },

    async readJournal(
      sessionId: string,
      options?: { workspaceId?: string },
    ): Promise<readonly AgentSessionUpdate[]> {
      if (!hasAgentsPermission()) {
        throw new Error(
          'ctx.agents.sessions.readJournal() needs the "agents" permission — add it to your extension\'s silo.permissions.',
        );
      }
      // `||`, not `??`: a caller that has no workspace to name passes an empty
      // string as readily as it omits the field (a dock panel reads its own
      // from the host, which answers `""` for a dock whose registration has not
      // landed yet), and treating that as an explicit choice fails the connect
      // outright rather than falling back to the active workspace.
      const workspaceId = options?.workspaceId || store.activeWorkspaceId || "";
      if (!workspaceId) return [];
      const lines = await readJournalLines(workspaceId, sessionId);
      return parseJournalLines(lines);
    },
  };
}

function toSdkPermission(
  req: AcpPermissionRequest,
  respond: (outcome: AcpPermissionOutcome) => void,
): AgentPermissionRequest {
  // The `toolCall` params are the same shape the update stream carries, so a
  // Chat UI can show the diff it is being asked to approve without reading
  // `raw` — the whole point of phase 3.8.
  const toolCall = parseToolCall(req.raw.toolCall);
  return {
    toolCallId: req.toolCallId,
    title: req.title,
    options: req.options,
    ...(toolCall ? { toolCall } : {}),
    raw: req.raw as Readonly<Record<string, unknown>>,
    respond(optionId: string) {
      const match = req.options.find((o) => o.optionId === optionId);
      respond(
        match ? { outcome: "selected", optionId } : { outcome: "cancelled" },
      );
    },
  };
}

/** Normalize a thrown value into an Error, keeping an {@link AcpRpcError}'s
 *  agent-supplied message rather than burying it under `fallback`. */
function asError(err: unknown, fallback: string): Error {
  if (err instanceof AcpRpcError)
    return new Error(`${fallback}: ${err.message}`);
  if (err instanceof Error) return err;
  return new Error(`${fallback}: ${String(err)}`);
}

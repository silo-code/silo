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
 * The whole surface is gated on the `chatAgents` setting (off by default).
 */

import type {
  AgentContentBlock,
  AgentInfo,
  AgentPermissionRequest,
  AgentPromptBlock,
  AgentPromptResult,
  AgentSessionConfigOption,
  AgentSessionConnectOptions,
  AgentSessionHandle,
  AgentSessionUpdate,
  AgentSessionsService,
  Disposable,
} from "@silo-code/sdk";
import { store } from "../../state/store";
import { getAgentProfiles } from "../../state/agent-profiles";
import { agentsChannel } from "./agents-channel";
import { createAcpTransport } from "./acp-transport";
import {
  AcpRpcError,
  createAcpClient,
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
} from "./chat-agent-registry";
import { getActiveAgentSession } from "./agent-surface-registry";
import {
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

const TEXT_KINDS = new Set([
  "agent_message_chunk",
  "agent_thought_chunk",
  "user_message_chunk",
]);

function nowIso(): string {
  return new Date().toISOString();
}

function toAcpBlocks(blocks: readonly AgentPromptBlock[]): AcpContentBlock[] {
  return blocks.map((b) =>
    b.type === "text"
      ? { type: "text", text: b.text }
      : {
          type: "resource_link",
          uri: b.uri,
          ...(b.name ? { name: b.name } : {}),
        },
  );
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
 * @internal — host factory; extensions receive this as `ctx.agents.sessions`.
 */
export function createAgentSessionsService(): AgentSessionsService {
  return {
    async connect(
      profileId: string,
      options?: AgentSessionConnectOptions,
    ): Promise<AgentSessionHandle> {
      if (!store.chatAgents) {
        throw new Error(
          "Chat agents are turned off. Enable “Chat agents” on Settings → Agents.",
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

      const workspaceId = options?.workspaceId ?? store.activeWorkspaceId ?? "";
      const workspace = store.workspaces[workspaceId];
      if (!workspace) {
        throw new Error("No workspace to connect the Chat session in.");
      }
      const cwd = options?.cwd ?? workspace.folder;
      const assumedAgentId = profile.assumedAgentId;

      // --- listener + connection state -----------------------------------
      const updateListeners = new Set<(u: AgentSessionUpdate) => void>();
      const permissionListeners = new Set<
        (r: AgentPermissionRequest) => void
      >();
      const configListeners = new Set<() => void>();
      let disposed = false;
      let acpSessionId = "";
      let infoId = "";
      // Live snapshot: the handle exposes it through a getter, and both
      // `setConfigOption` and a `current_mode_update` the agent sends itself
      // replace it (immutably) and fire `configListeners`.
      let configOptions: AgentSessionConfigOption[] = [];

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
            if (title) patchChatAgent(infoId, { title });
          }
          const sdk = toSdkUpdate(update);
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

      function newClient(): AcpClient {
        return createAcpClient(
          createAcpTransport({
            command: launch.command,
            args: launch.args,
            cwd,
            env: launch.env,
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
        throw asError(err, `Could not start ${label}`);
      }

      let session;
      try {
        session = await client.newSession(cwd);
      } catch (err) {
        client.dispose();
        // `session/new` failing is the real "auth required" signal (recon
        // §5f) — and also how a vendor deprecation surfaces (recon Finding 5).
        // The agent's own message is on the AcpRpcError.
        throw asError(
          err,
          `${label} could not start a session (it may need you to sign in first)`,
        );
      }

      acpSessionId = session.sessionId;
      infoId = `chat:${acpSessionId}`;
      configOptions = toSdkConfigOptions(session.configOptions ?? []);
      const canResume = init.agentCapabilities?.loadSession === true;
      const agentName = init.agentInfo?.title ?? init.agentInfo?.name ?? label;

      const baseInfo: AgentInfo = {
        id: infoId,
        workspaceId,
        // Step 3 of the `AgentInfo.title` fallback: the agent's declared name,
        // else the profile's label. Step 1 — a title the agent volunteers in a
        // `session_info_update` — overwrites this if it ever arrives. Cursor
        // sends one; Claude does not, and the difference stays visible.
        title: agentName,
        kind: "chat",
        isAgent: true,
        activity: "idle",
        needsAttention: false,
        stale: false,
        canResume,
        sessionId: acpSessionId,
        agentName,
        agentId: assumedAgentId,
      };

      async function resume(): Promise<void> {
        if (disposed) return;
        const next = newClient();
        try {
          await next.initialize();
          await next.loadSession(acpSessionId, cwd);
        } catch (err) {
          next.dispose();
          agentsChannel.info(
            `Could not resume chat session ${infoId}: ${asError(err, "resume failed").message}`,
          );
          return;
        }
        client.dispose();
        client = next;
        patchChatAgent(infoId, {
          activity: "idle",
          needsAttention: false,
          attentionSince: undefined,
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
      agentsChannel.info(
        `Chat session ${infoId} connected (${agentName}${canResume ? ", resumable" : ""}).`,
      );

      const handle: AgentSessionHandle = {
        id: infoId,
        agentId: assumedAgentId,
        agentName,
        canResume,

        async prompt(
          blocks: readonly AgentPromptBlock[],
        ): Promise<AgentPromptResult> {
          applyPhase(beginTurn(currentPhase(), nowIso()));
          try {
            const { stopReason } = await client.prompt(
              acpSessionId,
              toAcpBlocks(blocks),
            );
            finishTurn(stopReason === "cancelled" ? "cancelled" : "finished");
            return { stopReason };
          } catch (err) {
            if (!disposed) finishTurn("failed");
            throw asError(err, "The prompt turn failed");
          }
        },

        cancel(): void {
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
          client.dispose();
          removeChatAgent(infoId);
          updateListeners.clear();
          permissionListeners.clear();
          configListeners.clear();
          agentsChannel.info(`Chat session ${infoId} disposed.`);
        },
      };

      return handle;
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

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
  AgentInfo,
  AgentPermissionRequest,
  AgentPromptBlock,
  AgentPromptResult,
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
  type AcpContentBlock,
  type AcpPermissionOutcome,
  type AcpPermissionRequest,
  type AcpSessionUpdate,
} from "./acp-jsonrpc";
import {
  patchChatAgent,
  registerChatAgent,
  removeChatAgent,
} from "./chat-agent-registry";

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

function toSdkUpdate(u: AcpSessionUpdate): AgentSessionUpdate {
  const kind = u.sessionUpdate;
  let text: string | undefined;
  if (TEXT_KINDS.has(kind)) {
    const content = u.content as { text?: unknown } | undefined;
    if (typeof content?.text === "string") text = content.text;
  }
  return {
    kind,
    text,
    messageId:
      typeof u.messageId === "string" ? (u.messageId as string) : undefined,
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
      let disposed = false;
      let acpSessionId = "";
      let infoId = "";

      const callbacks: AcpClientCallbacks = {
        onUpdate(update) {
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
          patchChatAgent(infoId, {
            needsAttention: true,
            attentionSince: nowIso(),
          });
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
          patchChatAgent(infoId, {
            activity: "error",
            workingSince: undefined,
            needsAttention: true,
            attentionSince: nowIso(),
          });
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
      const canResume = init.agentCapabilities?.loadSession === true;
      const agentName = init.agentInfo?.title ?? init.agentInfo?.name ?? label;

      const baseInfo: AgentInfo = {
        id: infoId,
        workspaceId,
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
          patchChatAgent(infoId, {
            activity: "working",
            workingSince: nowIso(),
            needsAttention: false,
            attentionSince: undefined,
          });
          try {
            const { stopReason } = await client.prompt(
              acpSessionId,
              toAcpBlocks(blocks),
            );
            const workspaceInactive = store.activeWorkspaceId !== workspaceId;
            const wantsAttention =
              stopReason === "refusal" ||
              (stopReason !== "cancelled" && workspaceInactive);
            patchChatAgent(infoId, {
              activity: "idle",
              workingSince: undefined,
              needsAttention: wantsAttention,
              attentionSince: wantsAttention ? nowIso() : undefined,
            });
            return { stopReason };
          } catch (err) {
            if (!disposed) {
              patchChatAgent(infoId, {
                activity: "error",
                workingSince: undefined,
                needsAttention: true,
                attentionSince: nowIso(),
              });
            }
            throw asError(err, "The prompt turn failed");
          }
        },

        cancel(): void {
          client.cancel(acpSessionId);
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
  return {
    toolCallId: req.toolCallId,
    title: req.title,
    options: req.options,
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

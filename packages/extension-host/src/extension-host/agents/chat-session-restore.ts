/**
 * Showing a Chat Agent Session that nothing has reconnected yet (RFC 0042).
 *
 * A Terminal session is visible the moment the app boots: `agents-service.ts`
 * tracks one per terminal record, in **every** workspace, off state persisted
 * under `AppState.agentState` — no UI required. A Chat session had no such
 * path. Its `AgentInfo` came into existence inside `connect()`, and `connect()`
 * only runs when the panel mounts — which for a background workspace does not
 * happen until the user visits it (`CenterDock` mounts a `WorkspaceDock` only
 * for workspaces warmed this run). So after a restart into workspace B, a Chat
 * session left open in workspace A was simply *absent* from the Agents
 * navigator until A was activated, even though everything needed to describe it
 * was sitting on disk.
 *
 * This module closes that gap the same way the terminal side does — from
 * persistence, not from UI:
 *
 * - **Write**: whenever a live Chat session's identity changes, its last-known
 *   status is mirrored into `AppState.chatSessionState`.
 * - **Read**: every recorded Chat panel, in every workspace, gets a **dormant**
 *   registration — `chatResumeState: "dormant"`, `activity: "idle"`, the title
 *   it last showed. Revealing one activates its workspace and asks its tab to
 *   come to the front; the panel then mounts and `connect()` replaces the
 *   dormant entry with the live one, under the same id.
 *
 * Nothing here spawns an agent or touches the network. A dormant entry is a
 * *claim about the past* — it says the conversation exists, not that anything
 * is running.
 */

import type { AgentActivity, AgentInfo } from "@silo-code/sdk";
import { store } from "../../state/store";
import type {
  PersistedChatSession,
  WorkspaceInternal,
} from "../../state/types";
import { requestPanelActivation } from "../../docked/panel-activation-requests";
import { removePanelRecord } from "../../state/workspaces";
import {
  agentSessionForPanel,
  setPanelAgentSession,
} from "./agent-surface-registry";
import { recordedPanelId } from "../dock-panel-kinds";
import {
  chatAgentInfos,
  getChatAgentEntry,
  onChatAgentsChanged,
  registerChatAgent,
  removeChatAgent,
} from "./chat-agent-registry";

/** A Chat session known only from persistence, plus where its panel lives. */
export interface DormantChatSession {
  info: AgentInfo;
  /** The dockview panel id to activate when the user reveals this session. */
  panelId: string;
  /** The {@link DockPanelRecord} id behind that panel — what closing the tab
   *  removes while nothing is mounted. */
  panelRecordId: string;
}

/**
 * The `chat:`-prefixed Agent Session id for an ACP session id. The one place
 * the prefix is spelled out on this side; `acp-sessions-service.ts` mints the
 * same string for the live registration, and the two **must** agree or a
 * connect would sit alongside its own dormant entry instead of replacing it.
 */
export function chatAgentId(sessionId: string): string {
  return `chat:${sessionId}`;
}

/**
 * A recorded panel's Chat session id, or `null`.
 *
 * The host does not own a panel kind's `state` and never validates it — but a
 * recorded panel's `sessionId` is already read this way to decide which
 * transcript journals are still referenced (`WorkspaceDock`), and this is the
 * same read for the same reason. The convention alone resurrects nothing: an
 * entry appears only where a persisted Chat status *also* exists under that id.
 */
function recordSessionId(
  state: Readonly<Record<string, unknown>>,
): string | null {
  const id = state.sessionId;
  return typeof id === "string" && id.length > 0 ? id : null;
}

/**
 * Which dormant entries the current recorded panels and persisted statuses
 * imply — pure, so the reconciliation rules are testable without a store.
 *
 * A session is listed when a recorded panel in some workspace references it
 * *and* a persisted status exists for it. Both halves are required: a panel
 * whose agent never connected has nothing to show, and a status whose panel is
 * gone is a closed conversation, not a hidden one.
 */
export function dormantChatSessions(
  workspaces: Readonly<Record<string, WorkspaceInternal | undefined>>,
  chatState: Readonly<Record<string, PersistedChatSession>>,
): DormantChatSession[] {
  const out: DormantChatSession[] = [];
  const seen = new Set<string>();
  for (const [workspaceId, ws] of Object.entries(workspaces)) {
    for (const panel of ws?.panels ?? []) {
      const sessionId = recordSessionId(panel.state);
      if (!sessionId) continue;
      const id = chatAgentId(sessionId);
      if (seen.has(id)) continue;
      const persisted = chatState[id];
      if (!persisted) continue;
      seen.add(id);
      out.push({
        panelId: recordedPanelId(panel.kindId, panel.id),
        panelRecordId: panel.id,
        info: {
          id,
          // The record's own workspace wins over the persisted one: the panel
          // is where the session is *now*, and the status could have been
          // written before a move.
          workspaceId,
          title: persisted.title,
          kind: "chat",
          isAgent: true,
          ...restoredActivity(persisted),
          canResume: persisted.canResume,
          sessionId,
          agentName: persisted.agentName,
          agentId: persisted.agentId,
          chatResumeState: "dormant",
        },
      });
    }
  }
  return out;
}

/**
 * What a restored session's **status** looks like — the part of an `AgentInfo`
 * that describes what the agent is doing, rather than which agent it is.
 *
 * The rule, and the reason it is not simply "restore what was persisted":
 *
 * - **Attention survives.** "The agent finished and you have not looked yet"
 *   is still true after a restart, and its `attentionSince` is what the row's
 *   elapsed time is measured from — resetting it would relabel a two-hour-old
 *   finish as brand new.
 * - **Working does not.** The process that was mid-turn is gone, so the turn
 *   is over however it ended. It comes back `idle` and `stale` — the soft,
 *   self-clearing "this was restored and can't be fully trusted" signal the
 *   terminal side already uses for exactly this case — never as a spinner that
 *   would spin forever.
 * - **`error` / `dead` do not.** Both describe a process, and this session has
 *   none until something reconnects; the panel decides what to show once it
 *   tries.
 */
export function restoredActivity(persisted: PersistedChatSession): {
  activity: AgentActivity;
  needsAttention: boolean;
  attentionSince?: string;
  stale: boolean;
} {
  const wasWorking = persisted.activity === "working";
  return {
    activity: "idle",
    needsAttention: persisted.needsAttention,
    ...(persisted.attentionSince
      ? { attentionSince: persisted.attentionSince }
      : {}),
    stale: wasWorking,
  };
}

/**
 * The status worth persisting for a live Chat session, or `null` when there is
 * nothing durable to say about it (no session id to resume, or the entry is
 * itself a dormant restore, which would just rewrite what it was built from).
 */
export function chatSessionStatus(
  info: AgentInfo,
  lastLiveAt: string,
  prior?: PersistedChatSession,
): PersistedChatSession | null {
  if (info.kind !== "chat") return null;
  if (info.chatResumeState === "dormant") return null;
  if (!info.sessionId) return null;
  const configDir = prior?.configDir ?? configDirBySession.get(info.id);
  return {
    workspaceId: info.workspaceId,
    sessionId: info.sessionId,
    title: info.title,
    agentName: info.agentName,
    agentId: info.agentId,
    canResume: info.canResume,
    // Where the agent keeps this session. Reported by `connect()` through
    // {@link noteChatSessionConfigDir} — read from the prior row, or from what
    // that call is holding when this is the row that first creates it, so a
    // status update never drops it and never has to wait for one.
    ...(configDir ? { configDir } : {}),
    activity: info.activity,
    needsAttention: info.needsAttention,
    ...(info.attentionSince ? { attentionSince: info.attentionSince } : {}),
    lastLiveAt,
  };
}

/**
 * Record which config directory a live session's agent is actually running
 * with, so a later restore can address the same store (see
 * {@link PersistedChatSession.configDir}). A no-op until the session has a
 * persisted status — the next status write carries it forward.
 */
export function noteChatSessionConfigDir(
  agentSessionId: string,
  configDir: string | undefined,
): void {
  if (!configDir) return;
  // Held here as well as stamped, because the two writers race: `connect()`
  // knows the directory as soon as the child is spawned, while the status row
  // itself is written by the registry listener below. Whichever lands first,
  // the value survives.
  configDirBySession.set(agentSessionId, configDir);
  const prev = store.chatSessionState[agentSessionId];
  if (!prev || prev.configDir === configDir) return;
  store.chatSessionState[agentSessionId] = { ...prev, configDir };
}

/** Agent Session id → the config directory its agent is running with, for the
 *  window before its status row exists. */
const configDirBySession = new Map<string, string>();

/** Whether two statuses differ in anything but their timestamp — the gate that
 *  keeps a per-turn activity change from rewriting (and re-persisting) an
 *  identical row. */
export function chatSessionStatusChanged(
  prev: PersistedChatSession | undefined,
  next: PersistedChatSession,
): boolean {
  if (!prev) return true;
  return (
    prev.workspaceId !== next.workspaceId ||
    prev.sessionId !== next.sessionId ||
    prev.title !== next.title ||
    prev.agentName !== next.agentName ||
    prev.agentId !== next.agentId ||
    prev.canResume !== next.canResume ||
    prev.activity !== next.activity ||
    prev.needsAttention !== next.needsAttention ||
    prev.attentionSince !== next.attentionSince
  );
}

// ---- live wiring ------------------------------------------------------------

/** Ids this module registered, so it only ever withdraws its own entries — a
 *  live session that has since taken over an id is not ours to remove. */
const dormantIds = new Map<string, string>();

/** Whether the once-per-run orphan prune has happened (it needs a hydrated
 *  store, so it rides the first sync that finds one rather than boot order). */
let pruned = false;

/** Mirror every live Chat session's identity into `AppState.chatSessionState`.
 *  Runs on any chat-registry change; writes only on a real difference, so a
 *  turn starting or a permission arriving costs nothing. */
function persistChatSessionStatuses(): void {
  const now = new Date().toISOString();
  for (const info of chatAgentInfos()) {
    const prior = store.chatSessionState[info.id];
    const next = chatSessionStatus(info, now, prior);
    if (!next) continue;
    if (!chatSessionStatusChanged(prior, next)) continue;
    store.chatSessionState[info.id] = next;
  }
}

/**
 * Reconcile dormant registrations against the recorded panels. Called from the
 * same store subscription that syncs Terminal sessions, so a panel closing, a
 * workspace being deleted, or a `session/load` adopting a new id all withdraw
 * the entry they invalidate.
 */
export function syncDormantChatSessions(): void {
  // Before hydration the store is empty; registering off it would show
  // nothing and then withdraw it a moment later.
  if (!store.hydrated) return;
  if (!pruned) {
    pruned = true;
    pruneOrphanedChatSessionStatuses();
  }
  const wanted = dormantChatSessions(store.workspaces, store.chatSessionState);
  const wantedIds = new Set(wanted.map((d) => d.info.id));
  for (const [id, panelId] of [...dormantIds]) {
    if (wantedIds.has(id)) continue;
    dormantIds.delete(id);
    // Withdraw the tab binding too — but only if it is still ours. A mounted
    // panel that re-declared the same session owns it now.
    if (agentSessionForPanel(panelId) === id) {
      setPanelAgentSession(panelId, null);
    }
    removeChatAgent(id);
  }
  for (const { info, panelId, panelRecordId } of wanted) {
    // A live session owns this id — it has a real connection behind it and
    // everything a dormant entry could say, only better.
    //
    // Note what this deliberately does *not* check: whether we registered this
    // id before. A connect that fails (the agent's binary missing, an auth
    // wall) removes its own registration on the way out, and the session would
    // then be gone from the navigator entirely — the tab still open, the
    // conversation still on disk, and no row anywhere. Re-registering whenever
    // the id is unclaimed makes the dormant entry the floor rather than a
    // one-shot.
    if (getChatAgentEntry(info.id)) continue;
    const workspaceId = info.workspaceId;
    const open = () => requestPanelActivation(workspaceId, panelId);
    // Tell the host which session this *tab* is showing, before the panel is
    // mounted to say so itself. Tab chrome — the agent's brand icon, the
    // activity badge — resolves through this map, so without it a restored
    // Chat tab sits blank until its panel mounts and connects. The panel
    // replaces this binding with its own (carrying a real `close`) the moment
    // it does mount; until then, closing the tab means dropping its record.
    setPanelAgentSession(panelId, info.id, {
      close: () => removePanelRecord(workspaceId, panelRecordId),
    });
    registerChatAgent(info, {
      // The panel isn't mounted (that is the whole point), so this records the
      // intent its dock applies on arrival — the same mechanism a
      // cross-workspace `ctx.terminals.focus` uses. `AgentsService.reveal`
      // has already activated the workspace by the time this runs.
      reveal: open,
      // Same action for `resume`: with no connection to reconnect, bringing
      // this conversation back *is* opening its panel — the `connect({ resume
      // })` on mount is the resume. A control that did nothing would be worse
      // than none, since the persisted `canResume` invites the call.
      resume: open,
    });
    dormantIds.set(info.id, panelId);
  }
}

/** Drop persisted statuses no recorded panel references any more — a closed
 *  Chat tab's conversation is over, and its row should not come back at the
 *  next boot. Run once, after hydration. */
export function pruneOrphanedChatSessionStatuses(): void {
  const referenced = new Set<string>();
  for (const ws of Object.values(store.workspaces)) {
    for (const panel of ws?.panels ?? []) {
      const sessionId = recordSessionId(panel.state);
      if (sessionId) referenced.add(chatAgentId(sessionId));
    }
  }
  for (const id of Object.keys(store.chatSessionState)) {
    if (!referenced.has(id)) delete store.chatSessionState[id];
  }
}

let started = false;

/** Start mirroring live Chat sessions into persistence. The read half runs off
 *  `agents-service`'s own store subscription — see {@link syncDormantChatSessions}. */
export function startChatSessionStatusPersistence(): void {
  if (started) return;
  started = true;
  onChatAgentsChanged(persistChatSessionStatuses);
}

/** Tests only — forget which entries this module registered. */
export function _resetDormantChatSessionsForTests(): void {
  dormantIds.clear();
  configDirBySession.clear();
  pruned = false;
}

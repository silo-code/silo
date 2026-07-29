/**
 * Hook-based exact resume — events.jsonl consume, catch-up timers, and
 * directory watch. Host supplies sticky terminals + applyHookMatch via
 * {@link HookRuntimeDeps}.
 */
import { invoke } from "@tauri-apps/api/core";
import { agentsChannel } from "./agents-channel";
import {
  readNewHookEvents,
  matchHookEventsToTerminals,
  pickEarliestMatchPerTerminal,
  pruneUnmatchedEvents,
  pruneAgentHooksEventsFile,
  stampNewHookEvents,
  resetHookEventsCheckpoint,
  disposeHookEventsRuntime,
  resolveAgentHooksDir,
  type HookEvent,
  type PendingHookEvent,
} from "./agent-hook-events";
import { startWatch, stopWatch, onFileChange } from "../services/tauri-watch";

const AGENT_HOOKS_WATCH_ID = "silo-agent-hooks";
const HOOK_CATCHUP_DELAYS_MS = [0, 500, 2_000] as const;

export interface HookRuntimeTerminal {
  terminalId: string;
  pgid: number | null;
  agentPgid: number | null;
}

export interface HookRuntimeDeps {
  listTerminals(): HookRuntimeTerminal[];
  applyHookMatch(terminalId: string, event: HookEvent): void;
}

export interface HookRuntime {
  scheduleHookCatchupReads(): void;
  consumeHookEvents(): Promise<void>;
  startAgentHooksWatch(): Promise<void>;
  dispose(): void;
}

export function createHookRuntime(deps: HookRuntimeDeps): HookRuntime {
  let pendingHookEvents: PendingHookEvent[] = [];
  let consumeInFlight = false;
  let consumeQueued = false;
  const hookCatchupTimers = new Set<ReturnType<typeof setTimeout>>();
  let unlistenHookWatch: (() => void) | null = null;

  function scheduleHookCatchupReads() {
    for (const ms of HOOK_CATCHUP_DELAYS_MS) {
      if (ms === 0) {
        void consumeHookEvents();
        continue;
      }
      const handle = setTimeout(() => {
        hookCatchupTimers.delete(handle);
        void consumeHookEvents();
      }, ms);
      hookCatchupTimers.add(handle);
    }
  }

  async function consumeHookEvents() {
    if (consumeInFlight) {
      consumeQueued = true;
      return;
    }
    consumeInFlight = true;

    try {
      do {
        consumeQueued = false;
        const terminals = deps.listTerminals();
        if (terminals.length === 0) {
          pendingHookEvents = [];
          continue;
        }

        const now = Date.now();
        const newEvents = stampNewHookEvents(await readNewHookEvents(), now);

        if (newEvents.length > 0) {
          agentsChannel.debug(
            `Read ${newEvents.length} new hook event(s): ` +
              newEvents
                .map((e) => `pid=${e.event.pid}(${e.event.agent})`)
                .join(", "),
          );
        }

        const candidates =
          pendingHookEvents.length > 0
            ? [...pendingHookEvents, ...newEvents]
            : newEvents;
        if (candidates.length === 0) continue;

        const livePids = new Set<number>();
        for (const t of terminals) {
          if (t.pgid != null) livePids.add(t.pgid);
          if (t.agentPgid != null) livePids.add(t.agentPgid);
        }
        const matches = matchHookEventsToTerminals(
          candidates.map((c) => c.event),
          terminals,
        );
        const applied = pickEarliestMatchPerTerminal(matches);
        const matchedSessionIds = new Set<string>();
        for (const match of applied) {
          deps.applyHookMatch(match.terminalId, match.event);
          matchedSessionIds.add(match.event.sessionId);
        }
        pendingHookEvents = pruneUnmatchedEvents(
          candidates,
          matches,
          now,
          livePids,
        );
        if (pendingHookEvents.length > 0) {
          agentsChannel.debug(
            `${pendingHookEvents.length} hook event(s) still unmatched: ` +
              pendingHookEvents
                .map((c) => `pid=${c.event.pid}(${c.event.agent})`)
                .join(", ") +
              ` — tracked terminal pgids: ` +
              terminals
                .map(
                  (t) =>
                    `${t.terminalId.slice(-8)}=pgid:${t.pgid}/agent:${t.agentPgid}`,
                )
                .join(", "),
          );
        }
        try {
          await pruneAgentHooksEventsFile(
            now,
            matchedSessionIds.size > 0 ? matchedSessionIds : undefined,
          );
        } catch (err) {
          agentsChannel.warn("Pruning agent-hooks events.jsonl failed", err);
        }
      } while (consumeQueued);
    } catch (err) {
      agentsChannel.warn("consumeHookEvents threw", err);
    } finally {
      consumeInFlight = false;
      if (consumeQueued) {
        consumeQueued = false;
        void consumeHookEvents();
      }
    }
  }

  async function startAgentHooksWatch() {
    try {
      const dir = await resolveAgentHooksDir();
      await invoke("fs_create_dir", { path: dir });
      await startWatch(AGENT_HOOKS_WATCH_ID, dir);
      unlistenHookWatch = await onFileChange((evt) => {
        if (evt.watchId !== AGENT_HOOKS_WATCH_ID) return;
        void consumeHookEvents();
      });
      agentsChannel.info(
        `Hook-events watch started on ${dir} (consume on write, not polled).`,
      );
    } catch (err) {
      agentsChannel.warn(
        "Could not start agent-hooks file watch; catch-up reads only.",
        err,
      );
    }
  }

  function dispose() {
    for (const handle of hookCatchupTimers) clearTimeout(handle);
    hookCatchupTimers.clear();
    unlistenHookWatch?.();
    unlistenHookWatch = null;
    void stopWatch(AGENT_HOOKS_WATCH_ID).catch(() => {});
    pendingHookEvents = [];
    consumeInFlight = false;
    consumeQueued = false;
    resetHookEventsCheckpoint();
    disposeHookEventsRuntime();
  }

  return {
    scheduleHookCatchupReads,
    consumeHookEvents,
    startAgentHooksWatch,
    dispose,
  };
}

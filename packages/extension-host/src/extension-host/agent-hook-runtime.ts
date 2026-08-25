/**
 * Hook-based exact resume — events.jsonl consume, catch-up timers, and
 * directory watch. Host supplies sticky terminals + applyHookMatch via
 * {@link HookRuntimeDeps}.
 */
import { invoke } from "@tauri-apps/api/core";
import { systemInfo } from "../services/tauri-system";
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
  hookEventCompatibleWithStickyAgent,
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
  /** The terminal's sticky foreground-agent catalog id (`"claude"`, `"cursor"`,
   * …), or `null` if not yet known. Used to drop a hook event whose `agent`
   * doesn't match this terminal's actual agent — e.g. the Claude-tagged twin a
   * Cursor session fires (a claude subprocess re-running Claude's SessionStart
   * hook) shares Cursor's pgid, so it pgid-matches the Cursor terminal but must
   * not be applied to it. */
  agentCatalogId: string | null;
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
        // Drop matches whose event agent doesn't match the terminal's sticky
        // agent BEFORE picking the earliest per terminal — otherwise a
        // Claude-tagged twin (same pgid as a Cursor session) can be the
        // earliest, win the pick, then get rejected downstream, discarding the
        // real Cursor event entirely. The incompatible matches stay in
        // `matches` (not `compatible`) so pruning still treats them as consumed
        // rather than retrying them forever.
        const agentByTerminal = new Map(
          terminals.map((t) => [t.terminalId, t.agentCatalogId]),
        );
        const compatible = matches.filter((m) =>
          hookEventCompatibleWithStickyAgent(
            m.event.agent,
            agentByTerminal.get(m.terminalId) ?? null,
          ),
        );
        if (compatible.length < matches.length) {
          agentsChannel.debug(
            `Dropped ${matches.length - compatible.length} hook match(es) whose agent ` +
              `didn't match the terminal's foreground agent (e.g. a Cursor session's Claude twin).`,
          );
        }
        const applied = pickEarliestMatchPerTerminal(compatible);
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
    // Unconditional: on Windows the hooks dir may not resolve or the watch may
    // fail outright, and that is precisely the platform whose capability line
    // matters — `bindForeground`'s "no snapshot" message points readers at it.
    void logPlatformCapabilities();
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

/**
 * State what agent machinery is actually available on this platform, once, at
 * startup.
 *
 * Every other line in this channel describes something that happened. This one
 * describes what *can* happen — which is the line that was missing when agents
 * silently failed to be identified on Windows: the channel logged the
 * foreground path in detail and said nothing about the fact that there is no
 * foreground path there at all. A user reporting "my agent doesn't show up" can
 * paste this instead of us reading source.
 */
async function logPlatformCapabilities(): Promise<void> {
  try {
    const { os } = await systemInfo();
    const windows = os === "windows";
    agentsChannel.info(
      `Agent capabilities on ${os}: ` +
        `foreground=${windows ? "process-tree walk" : "tcgetpgrp"} · ` +
        `identity=${windows ? "leader name (via walk)" : "leader name"} · ` +
        `hooks=${windows ? "unavailable (POSIX shell only)" : "available"} · ` +
        `activity=OSC`,
    );
  } catch {
    // Never let diagnostics break startup.
  }
}

/**
 * Session-file exact resume (e.g. Grok) — registry reads, short retries, and
 * parent-dir watch. Host wires sticky identity + applyResumeHint via
 * {@link SessionFileResumeDeps}; this module owns timers and watches only.
 */
import { invoke } from "@tauri-apps/api/core";
import { agentsChannel } from "./agents-channel";
import {
  agentById,
  sessionFileAgents,
  type AgentDefinition,
  type AgentSessionFileResume,
} from "./agent-catalog";
import type { ResumeHint } from "./agent-resume-hint";
import { homeDir } from "./platform";
import { startWatch, stopWatch, onFileChange } from "../services/tauri-watch";

/** Delays (ms after a session-file agent is first seen in the foreground). */
const SESSION_FILE_READ_DELAYS_MS = [0, 600, 1500, 3000];
const SESSION_FILE_WATCH_PREFIX = "silo-agent-session-file:";

/** Sticky identity the runtime needs from the host's tracked-agent map. */
export interface SessionFileSticky {
  agentCatalogId: string | null;
  agentPgid: number | null;
  /** Current resolved agentId on AgentInfo/state (for demotion-on-drop). */
  resolvedAgentId?: string;
  resolvedSessionId?: string;
  resolvedResumeCommand?: string;
}

export interface SessionFileResumeDeps {
  getSticky(terminalId: string): SessionFileSticky | null;
  listSessionFileTargets(): Array<{
    terminalId: string;
    agentCatalogId: string;
    agentPgid: number;
  }>;
  applyResumeHint(terminalId: string, hint: ResumeHint): void;
  demotePromotedShell(terminalId: string): void;
}

export interface SessionFileResumeRuntime {
  scheduleSessionFileReads(
    terminalId: string,
    agent: AgentDefinition,
    resume: AgentSessionFileResume,
    pgid: number,
  ): void;
  clearSessionFileTimersFor(terminalId: string): void;
  clearAllSessionFileTimers(): void;
  ensureSessionFileWatches(): Promise<void>;
  dispose(): void;
}

function sessionFileParentDir(home: string, sessionFilePath: string): string {
  const idx = sessionFilePath.lastIndexOf("/");
  return idx >= 0 ? `${home}/${sessionFilePath.slice(0, idx)}` : home;
}

export function createSessionFileResumeRuntime(
  deps: SessionFileResumeDeps,
): SessionFileResumeRuntime {
  const sessionFileTimersByTerminal = new Map<
    string,
    Set<ReturnType<typeof setTimeout>>
  >();
  const sessionFileWatchIds = new Set<string>();
  let unlistenSessionFileWatch: (() => void) | null = null;
  let sessionFileWatchReady = false;

  function clearSessionFileTimersFor(terminalId: string) {
    const timers = sessionFileTimersByTerminal.get(terminalId);
    if (!timers) return;
    for (const h of timers) clearTimeout(h);
    sessionFileTimersByTerminal.delete(terminalId);
  }

  function clearAllSessionFileTimers() {
    for (const terminalId of [...sessionFileTimersByTerminal.keys()]) {
      clearSessionFileTimersFor(terminalId);
    }
  }

  async function resolveSessionFileId(
    terminalId: string,
    agent: AgentDefinition,
    resume: AgentSessionFileResume,
    pgid: number,
  ) {
    const entry = deps.getSticky(terminalId);
    if (
      !entry ||
      entry.agentCatalogId !== agent.id ||
      entry.agentPgid !== pgid
    ) {
      return;
    }

    let text: string;
    try {
      const base = (await homeDir()).replace(/\/+$/, "");
      text = await invoke<string>("fs_read_text", {
        path: `${base}/${resume.sessionFilePath}`,
      });
    } catch {
      return;
    }

    const live = deps.getSticky(terminalId);
    if (!live || live.agentCatalogId !== agent.id || live.agentPgid !== pgid) {
      return;
    }

    const sessionId = resume.resolveSessionId(text, pgid);
    if (!sessionId) {
      if (live.resolvedAgentId === agent.id && live.resolvedSessionId) {
        deps.demotePromotedShell(terminalId);
      }
      return;
    }

    const resumeCommand = resume.buildResumeCommand(sessionId);
    if (
      live.resolvedSessionId === sessionId &&
      live.resolvedAgentId === agent.id &&
      live.resolvedResumeCommand === resumeCommand
    ) {
      return;
    }

    deps.applyResumeHint(terminalId, {
      sessionId,
      resumeCommand,
      agentName: agent.displayName,
      agentId: agent.id,
    });
    agentsChannel.info(
      `Resolved ${agent.displayName} session ${sessionId} for terminal ${terminalId} ` +
        `from ${resume.sessionFilePath} (pgid ${pgid}).`,
    );
  }

  function resolveAllSessionFileAgents() {
    for (const t of deps.listSessionFileTargets()) {
      const agent = agentById(t.agentCatalogId);
      if (agent?.resume.kind !== "session-file") continue;
      void resolveSessionFileId(t.terminalId, agent, agent.resume, t.agentPgid);
    }
  }

  function scheduleSessionFileReads(
    terminalId: string,
    agent: AgentDefinition,
    resume: AgentSessionFileResume,
    pgid: number,
  ) {
    void ensureSessionFileWatches();
    clearSessionFileTimersFor(terminalId);
    const timers = new Set<ReturnType<typeof setTimeout>>();
    sessionFileTimersByTerminal.set(terminalId, timers);
    for (const ms of SESSION_FILE_READ_DELAYS_MS) {
      if (ms === 0) {
        void resolveSessionFileId(terminalId, agent, resume, pgid);
        continue;
      }
      const h = setTimeout(() => {
        timers.delete(h);
        if (timers.size === 0) sessionFileTimersByTerminal.delete(terminalId);
        void resolveSessionFileId(terminalId, agent, resume, pgid);
      }, ms);
      timers.add(h);
    }
  }

  async function ensureSessionFileWatches() {
    if (sessionFileWatchReady) return;
    const agents = sessionFileAgents();
    if (agents.length === 0) return;

    try {
      const home = (await homeDir()).replace(/\/+$/, "");
      const dirs = [
        ...new Set(
          agents.map((a) =>
            sessionFileParentDir(home, a.resume.sessionFilePath),
          ),
        ),
      ];
      for (const dir of dirs) {
        const watchId = `${SESSION_FILE_WATCH_PREFIX}${dir}`;
        if (sessionFileWatchIds.has(watchId)) continue;
        try {
          await startWatch(watchId, dir);
          sessionFileWatchIds.add(watchId);
        } catch (err) {
          agentsChannel.debug(
            `Session-file watch not started for ${dir} (will retry).`,
            err,
          );
        }
      }
      if (sessionFileWatchIds.size === 0) return;

      if (!unlistenSessionFileWatch) {
        unlistenSessionFileWatch = await onFileChange((evt) => {
          if (!sessionFileWatchIds.has(evt.watchId)) return;
          void resolveAllSessionFileAgents();
        });
      }
      sessionFileWatchReady = true;
      agentsChannel.info(
        `Session-file watch started on ${[...sessionFileWatchIds].join(", ")} ` +
          `(resolve on write — covers agents that create a session after start).`,
      );
      resolveAllSessionFileAgents();
    } catch (err) {
      agentsChannel.warn(
        "Could not start session-file watch; short post-foreground retries only.",
        err,
      );
    }
  }

  function dispose() {
    clearAllSessionFileTimers();
    unlistenSessionFileWatch?.();
    unlistenSessionFileWatch = null;
    for (const id of sessionFileWatchIds) {
      void stopWatch(id).catch(() => {});
    }
    sessionFileWatchIds.clear();
    sessionFileWatchReady = false;
  }

  return {
    scheduleSessionFileReads,
    clearSessionFileTimersFor,
    clearAllSessionFileTimers,
    ensureSessionFileWatches,
    dispose,
  };
}

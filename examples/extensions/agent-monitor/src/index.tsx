import type {
  Extension,
  ExtensionContext,
  TerminalTabDecoration,
  WorkspaceStatusRow,
} from "@silo-code/sdk";
import { AGENT_DETECTORS } from "./osc-detectors";
import {
  reduce,
  deriveStatusRow,
  deriveTabBadge,
  stripStatusMarker,
  toPersisted,
  restoreState,
  type Activity,
  type AgentEvent,
  type EventSource,
  type PersistedAgentState,
  type TerminalAgentState,
} from "./agent-status";
import {
  settingsService,
  initSettings,
  clearSettingsListeners,
  AgentMonitorSettingsPage,
} from "./settings";
import styles from "./styles.css";

const STYLE_ID = "silo-agent-monitor-styles";

// Set to true to log OSC events and state transitions to the browser console.
// Open devtools in Silo with Cmd+Option+I (Mac) or F12.
const DEBUG = true;

function log(...args: unknown[]) {
  if (DEBUG) console.log("[agent-monitor]", ...args);
}

// Bumped on every build so the console shows which build is actually loaded.
const BUILD = "2026-07-06a (timer block for promoted shells)";

// Prefix for the per-terminal persisted-state keys in ctx.storage.global,
// namespacing them away from settings keys (e.g. "hideStatusWhenFocused") in
// the same bag.
function stateStorageKey(terminalId: string): string {
  return `agentState:${terminalId}`;
}

function activate(ctx: ExtensionContext) {
  log(`build ${BUILD}`);
  const storage = ctx.storage.global;
  ctx.subscriptions.push(initSettings(storage));
  // Per-terminal agent state, keyed by terminal record id. All transitions go
  // through dispatch() → reduce(); this map is the single source of truth the
  // status-row and tab-decoration providers read from. Persisted to `storage`
  // on every transition (see dispatch()) so a working/needs-attention row's
  // elapsed time survives an app restart instead of resetting to the moment
  // the terminal reactivates.
  const states = new Map<string, TerminalAgentState>();
  // Disposables for per-terminal OSC subscriptions, keyed by terminal id.
  const oscSubs = new Map<string, { dispose(): void }>();
  // sessionId that was current when each OSC subscription was established.
  // An empty string means "subscribed while the PTY hadn't spawned yet".
  // When the sessionId changes (PTY spawns or restarts), we re-subscribe.
  const oscSubSessionIds = new Map<string, string>();
  // Per-terminal debounce timers for OSC 133 "working" → "waiting" fallback.
  // Some agents (e.g. pi) emit 133;C for each step but never emit 133;A/D on
  // completion. When the stream goes silent for SHELL_IDLE_MS we clear to waiting.
  const SHELL_IDLE_MS = 3_000;
  const shellIdleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // Pending debounced ✳ → "waiting" transitions. Claude Code emits ✳ briefly
  // between tool calls while computing the next action. The timer is cancelled
  // when the next braille-spinner OSC (working) arrives, so we only transition
  // to "waiting" if no working signal appears within AGENT_IDLE_DEBOUNCE_MS.
  const AGENT_IDLE_DEBOUNCE_MS = 1_500;
  const agentIdleTimers = new Map<string, ReturnType<typeof setTimeout>>();

  let activeTerminalId = ctx.terminals.getActive();

  function dispatch(terminalId: string, ev: AgentEvent) {
    const prev = states.get(terminalId);
    if (!prev) return;
    const next = reduce(prev, ev);
    // reduce() returns prev by identity when nothing changed — critical here,
    // since Claude Code's braille spinner emits an OSC 0 per animation frame
    // and each invalidation re-renders the Workspaces panel and terminal tabs.
    if (next === prev) return;
    const tid = terminalId.slice(-8);
    if (ev.type === "detected") {
      log(
        `${tid} ${prev.activity}→${next.activity}` +
          ` isAgent=${next.isAgent} needsAttn=${next.needsAttention}` +
          ` (src=${ev.source} status=${ev.status})`,
      );
    } else {
      log(`${tid} activated → needsAttn cleared`);
    }
    states.set(terminalId, next);
    storage.set(stateStorageKey(terminalId), toPersisted(next));
    ctx.workspaces.invalidateStatus();
    ctx.terminals.invalidateTabDecorations();
  }

  function detectedEvent(
    terminalId: string,
    status: Activity,
    source: EventSource,
  ): AgentEvent {
    return {
      type: "detected",
      status,
      source,
      // Gated by the "hide status when focused" setting: when disabled, focus
      // never suppresses a row, so this is always false.
      isActiveTerminal:
        settingsService.getState().hideStatusWhenFocused &&
        terminalId === activeTerminalId,
      now: new Date().toISOString(),
    };
  }

  function clearShellIdleTimer(terminalId: string) {
    const t = shellIdleTimers.get(terminalId);
    if (t !== undefined) {
      clearTimeout(t);
      shellIdleTimers.delete(terminalId);
    }
  }

  function scheduleShellIdle(terminalId: string) {
    clearShellIdleTimer(terminalId);
    shellIdleTimers.set(
      terminalId,
      setTimeout(() => {
        shellIdleTimers.delete(terminalId);
        dispatch(terminalId, detectedEvent(terminalId, "waiting", "timer"));
      }, SHELL_IDLE_MS),
    );
  }

  function clearAgentIdleTimer(terminalId: string) {
    const t = agentIdleTimers.get(terminalId);
    if (t !== undefined) {
      clearTimeout(t);
      agentIdleTimers.delete(terminalId);
    }
  }

  function scheduleAgentIdle(terminalId: string) {
    clearAgentIdleTimer(terminalId);
    agentIdleTimers.set(
      terminalId,
      setTimeout(() => {
        agentIdleTimers.delete(terminalId);
        dispatch(terminalId, detectedEvent(terminalId, "waiting", "agent"));
      }, AGENT_IDLE_DEBOUNCE_MS),
    );
  }

  function subscribeTerminalOsc(terminalId: string, sessionId: string) {
    const prevSessionId = oscSubSessionIds.get(terminalId);
    // Skip if we already have a live sub for this exact session. If sessionId
    // is still empty (PTY not spawned yet), the prior poll is still running;
    // only skip if a real session is already subscribed.
    if (
      oscSubs.has(terminalId) &&
      prevSessionId === sessionId &&
      sessionId !== ""
    )
      return;
    // Dispose any stale sub (e.g. subscribed before the PTY spawned, poll
    // timed out, and now the PTY has spawned with a new sessionId).
    const stale = oscSubs.get(terminalId);
    if (stale) {
      stale.dispose();
      oscSubs.delete(terminalId);
    }
    oscSubSessionIds.set(terminalId, sessionId);
    const sub = ctx.terminals.subscribeOsc(terminalId, ({ code, payload }) => {
      for (const detect of AGENT_DETECTORS) {
        const result = detect(code, payload);
        if (result) {
          log(
            `osc${code} "${payload.slice(0, 40)}" → ${result.status}/${result.source}` +
              (result.timer ? ` timer:${result.timer}` : "") +
              ` tid=…${terminalId.slice(-8)}`,
          );
          if (result.timer === "schedule") scheduleShellIdle(terminalId);
          else if (result.timer === "clear") clearShellIdleTimer(terminalId);
          if (result.status === "waiting" && result.source === "agent") {
            // Debounce: Claude emits ✳ briefly between tool calls. Only transition
            // to "waiting" if no braille-spinner (working) OSC arrives within
            // AGENT_IDLE_DEBOUNCE_MS. The working branch below clears this timer.
            scheduleAgentIdle(terminalId);
          } else {
            if (result.status === "working") clearAgentIdleTimer(terminalId);
            dispatch(
              terminalId,
              detectedEvent(terminalId, result.status, result.source),
            );
          }
          break;
        }
      }
    });
    oscSubs.set(terminalId, sub);
    // Note: do NOT push into ctx.subscriptions — oscSubs manages the lifecycle
    // of these per-terminal subscriptions (disposed in syncOscSubscriptions and
    // the bulk disposable below). Pushing them would cause the array to grow
    // unboundedly as terminals open and close, and stale entries would be
    // double-disposed at deactivation.
  }

  function syncOscSubscriptions() {
    const ws = ctx.workspaces.getState();
    const live = new Set<string>();
    for (const workspace of ws.all) {
      for (const t of workspace.terminals) {
        live.add(t.id);
        if (!states.has(t.id)) {
          const persisted = storage.get<PersistedAgentState>(
            stateStorageKey(t.id),
          );
          states.set(t.id, restoreState(t.kind, persisted));
        }
        subscribeTerminalOsc(t.id, t.sessionId);
      }
    }
    // Clean up state for terminals that no longer exist.
    for (const [id, sub] of oscSubs) {
      if (!live.has(id)) {
        sub.dispose();
        oscSubs.delete(id);
        oscSubSessionIds.delete(id);
        states.delete(id);
        clearShellIdleTimer(id);
        clearAgentIdleTimer(id);
        storage.set(stateStorageKey(id), undefined);
      }
    }
  }

  ctx.subscriptions.push(
    ctx.workspaces.subscribe(() => {
      // Terminal titles/names live on workspace state, so status-row labels
      // may have changed even when our own state hasn't.
      ctx.workspaces.invalidateStatus();
      syncOscSubscriptions();
    }),
    ctx.terminals.subscribeActive((terminalId) => {
      activeTerminalId = terminalId;
      // Viewing a terminal clears its "needs attention" flag — unless the
      // user has disabled hiding status on focus, in which case it stays
      // visible until the underlying activity actually changes.
      if (terminalId && settingsService.getState().hideStatusWhenFocused) {
        dispatch(terminalId, { type: "activated" });
      }
    }),
    // Bulk cleanup at deactivation for whatever per-terminal resources are
    // still live at that point.
    {
      dispose() {
        for (const sub of oscSubs.values()) sub.dispose();
        oscSubs.clear();
        oscSubSessionIds.clear();
        for (const t of shellIdleTimers.values()) clearTimeout(t);
        shellIdleTimers.clear();
        for (const t of agentIdleTimers.values()) clearTimeout(t);
        agentIdleTimers.clear();
      },
    },
  );

  // Subscribe to any terminals already open at activation time.
  syncOscSubscriptions();

  ctx.subscriptions.push(
    ctx.workspaces.registerStatus({
      id: "silo.agent-monitor.status",
      provide(workspaceId): WorkspaceStatusRow[] {
        const ws = ctx.workspaces.get(workspaceId);
        if (!ws) return [];
        const rows: WorkspaceStatusRow[] = [];
        for (const t of ws.terminals) {
          const s = states.get(t.id);
          if (!s) continue;
          const row = deriveStatusRow(s);
          if (!row) continue;
          rows.push({
            id: t.id,
            label: t.customName ?? stripStatusMarker(t.title),
            status: row.status,
            startedAt: row.startedAt,
          });
        }
        return rows;
      },
    }),
  );

  ctx.subscriptions.push(
    ctx.terminals.registerTabDecoration({
      id: "silo.agent-monitor.tab",
      provide(terminalId): TerminalTabDecoration | null {
        const s = states.get(terminalId);
        if (!s) return null;
        switch (deriveTabBadge(s)) {
          case "working":
            return {
              icon: <SpinnerIcon />,
              color: "accent",
              tooltip: "Agent working",
            };
          case "attention":
            return {
              icon: <AttentionIcon />,
              color: "warn",
              tooltip: "Needs attention",
            };
          case "waiting":
            return {
              icon: <WaitingIcon />,
              color: "muted",
              tooltip: "Waiting for input",
            };
          case "done":
            return { icon: <DoneIcon />, color: "ok", tooltip: "Done" };
          case "error":
            return { icon: <ErrorIcon />, color: "error", tooltip: "Error" };
          default:
            return null;
        }
      },
    }),
  );

  // No group needed — the host groups non-core settings pages under Extensions.
  ctx.subscriptions.push(
    ctx.registerSettingsPage({
      id: "agent-monitor",
      title: "Agent Monitor",
      component: AgentMonitorSettingsPage,
    }),
  );

  injectStyles();
}

function deactivate() {
  document.getElementById(STYLE_ID)?.remove();
  clearSettingsListeners();
}

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = styles;
  document.head.appendChild(style);
}

function SpinnerIcon() {
  return <div className="am-spinner" aria-hidden="true" />;
}
function AttentionIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M6 1a3.2 3.2 0 0 0-3.2 3.2v2.1L1.7 8.3a.5.5 0 0 0 .42.77h7.76a.5.5 0 0 0 .42-.77L9.2 6.3V4.2A3.2 3.2 0 0 0 6 1z" />
      <path d="M4.8 9.9a1.2 1.2 0 0 0 2.4 0z" />
    </svg>
  );
}
function WaitingIcon() {
  return (
    <div className="am-waiting-icon" aria-hidden="true">
      <span />
      <span />
    </div>
  );
}
function DoneIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        d="M10 3L5 9 2 6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
function ErrorIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M6 1a5 5 0 1 0 0 10A5 5 0 0 0 6 1zm-.5 2.5h1v4h-1v-4zm0 5h1v1h-1v-1z" />
    </svg>
  );
}

export const extension: Extension = {
  id: "silo.agent-monitor",
  activate,
  deactivate,
};

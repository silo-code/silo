import type {
  Extension,
  ExtensionContext,
  TerminalTabDecoration,
  WorkspaceStatusRow,
} from "@silo-code/sdk";
import { AGENT_DETECTORS } from "./osc-detectors";
import {
  initialState,
  reduce,
  deriveStatusRow,
  deriveTabBadge,
  type Activity,
  type AgentEvent,
  type EventSource,
  type TerminalAgentState,
} from "./agent-status";
import styles from "./styles.css";

const STYLE_ID = "silo-agent-monitor-styles";

function activate(ctx: ExtensionContext) {
  // Per-terminal agent state, keyed by terminal record id. All transitions go
  // through dispatch() → reduce(); this map is the single source of truth the
  // status-row and tab-decoration providers read from.
  const states = new Map<string, TerminalAgentState>();
  // Disposables for per-terminal OSC subscriptions, keyed by terminal id.
  const oscSubs = new Map<string, { dispose(): void }>();
  // Per-terminal debounce timers for OSC 133 "working" → "waiting" fallback.
  // Some agents (e.g. pi) emit 133;C for each step but never emit 133;A/D on
  // completion. When the stream goes silent for SHELL_IDLE_MS we clear to waiting.
  const SHELL_IDLE_MS = 3_000;
  const shellIdleTimers = new Map<string, ReturnType<typeof setTimeout>>();

  let activeTerminalId = ctx.terminals.getActive();

  function dispatch(terminalId: string, ev: AgentEvent) {
    const prev = states.get(terminalId);
    if (!prev) return;
    const next = reduce(prev, ev);
    // reduce() returns prev by identity when nothing changed — critical here,
    // since Claude Code's braille spinner emits an OSC 0 per animation frame
    // and each invalidation re-renders the Workspaces panel and terminal tabs.
    if (next === prev) return;
    states.set(terminalId, next);
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
      isActiveTerminal: terminalId === activeTerminalId,
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

  function subscribeTerminalOsc(terminalId: string) {
    if (oscSubs.has(terminalId)) return;
    const sub = ctx.terminals.subscribeOsc(terminalId, ({ code, payload }) => {
      for (const detect of AGENT_DETECTORS) {
        const result = detect(code, payload);
        if (result) {
          if (result.timer === "schedule") scheduleShellIdle(terminalId);
          else if (result.timer === "clear") clearShellIdleTimer(terminalId);
          dispatch(
            terminalId,
            detectedEvent(terminalId, result.status, result.source),
          );
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
        if (!states.has(t.id)) states.set(t.id, initialState(t.kind));
        subscribeTerminalOsc(t.id);
      }
    }
    // Clean up state for terminals that no longer exist.
    for (const [id, sub] of oscSubs) {
      if (!live.has(id)) {
        sub.dispose();
        oscSubs.delete(id);
        states.delete(id);
        clearShellIdleTimer(id);
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
      // Viewing a terminal clears its "needs attention" flag.
      if (terminalId) dispatch(terminalId, { type: "activated" });
    }),
    // Bulk cleanup at deactivation for whatever per-terminal resources are
    // still live at that point.
    {
      dispose() {
        for (const sub of oscSubs.values()) sub.dispose();
        oscSubs.clear();
        for (const t of shellIdleTimers.values()) clearTimeout(t);
        shellIdleTimers.clear();
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
            label: t.customName ?? t.title,
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

  injectStyles();
}

function deactivate() {
  document.getElementById(STYLE_ID)?.remove();
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

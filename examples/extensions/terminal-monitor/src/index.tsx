import type {
  Activity,
  Extension,
  ExtensionContext,
  WorkspaceStatusRow,
} from "@silo-code/sdk";
import { TerminalMonitorPanel } from "./TerminalMonitorPanel";
import type { IconChoice } from "./types";
import { AGENT_DETECTORS } from "./osc-detectors";
import styles from "./styles.css";

const STYLE_ID = "silo-terminal-monitor-styles";

function choiceToActivity(
  choice: IconChoice | undefined,
): Activity | undefined {
  switch (choice) {
    case "working":
      return "working";
    case "waiting":
      return "warn";
    case "done":
      return "ready";
    case "error":
      return "error";
    default:
      return undefined;
  }
}

function activate(ctx: ExtensionContext) {
  const iconChoices = new Map<string, IconChoice>();
  // Terminals where the user has explicitly chosen a status — auto-detection
  // will not overwrite these.
  const manualOverrides = new Set<string>();
  // Disposables for per-terminal OSC subscriptions, keyed by terminal id.
  const oscSubs = new Map<string, { dispose(): void }>();
  // Per-terminal debounce timers for OSC 133 "working" → "waiting" fallback.
  // Some agents (e.g. pi) emit 133;C for each step but never emit 133;A/D on
  // completion. When the stream goes silent for SHELL_IDLE_MS we clear to waiting.
  const SHELL_IDLE_MS = 3_000;
  const shellIdleTimers = new Map<string, ReturnType<typeof setTimeout>>();

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
        setAutoStatus(terminalId, "waiting");
      }, SHELL_IDLE_MS),
    );
  }

  function bumpChrome() {
    ctx.workspaces.invalidateStatus();
    ctx.terminals.invalidateTabAdornments();
  }

  function setIconChoice(terminalId: string, choice: IconChoice) {
    if (choice === "none") {
      iconChoices.delete(terminalId);
      manualOverrides.delete(terminalId);
    } else {
      iconChoices.set(terminalId, choice);
      manualOverrides.add(terminalId);
    }
    bumpChrome();
  }

  function setAutoStatus(terminalId: string, choice: IconChoice | "none") {
    if (manualOverrides.has(terminalId)) return;
    if (choice === "none") {
      iconChoices.delete(terminalId);
    } else {
      iconChoices.set(terminalId, choice);
    }
    bumpChrome();
  }

  function subscribeTerminalOsc(terminalId: string) {
    if (oscSubs.has(terminalId)) return;
    const sub = ctx.terminals.subscribeOsc(terminalId, ({ code, payload }) => {
      for (const detect of AGENT_DETECTORS) {
        const result = detect(code, payload);
        if (result) {
          if (result.timer === "schedule") scheduleShellIdle(terminalId);
          else if (result.timer === "clear") clearShellIdleTimer(terminalId);
          setAutoStatus(terminalId, result.status);
          break;
        }
      }
    });
    oscSubs.set(terminalId, sub);
    // Note: do NOT push into ctx.subscriptions — oscSubs manages the lifecycle
    // of these per-terminal subscriptions (disposed in syncOscSubscriptions).
    // Pushing them would cause the array to grow unboundedly as terminals open
    // and close, and stale entries would be double-disposed at deactivation.
  }

  function syncOscSubscriptions() {
    const ws = ctx.workspaces.getState();
    const live = new Set<string>();
    for (const workspace of ws.all) {
      for (const t of workspace.terminals) {
        live.add(t.id);
        subscribeTerminalOsc(t.id);
      }
    }
    // Clean up subscriptions for terminals that no longer exist.
    for (const [id, sub] of oscSubs) {
      if (!live.has(id)) {
        sub.dispose();
        oscSubs.delete(id);
        iconChoices.delete(id);
        manualOverrides.delete(id);
        clearShellIdleTimer(id);
      }
    }
  }

  ctx.subscriptions.push(
    ctx.workspaces.subscribe(() => {
      ctx.workspaces.invalidateStatus();
      syncOscSubscriptions();
    }),
  );

  // Subscribe to any terminals already open at activation time.
  syncOscSubscriptions();

  ctx.subscriptions.push(
    ctx.workspaces.bindStatus({
      id: "silo.terminal-monitor.status",
      provide(workspaceId): WorkspaceStatusRow[] {
        const ws = ctx.workspaces.get(workspaceId);
        if (!ws) return [];
        return ws.terminals.map((t) => ({
          id: t.id,
          label: t.customName ?? t.title,
          activity: choiceToActivity(iconChoices.get(t.id)),
        }));
      },
    }),
  );

  ctx.subscriptions.push(
    ctx.terminals.bindActivity({
      id: "silo.terminal-monitor.tab",
      provide(terminalId) {
        const activity = choiceToActivity(iconChoices.get(terminalId));
        if (!activity) return null;
        return { activity, tooltip: activity };
      },
    }),
  );

  ctx.subscriptions.push(
    ctx.registerSidePanel({
      id: "silo.terminal-monitor",
      location: "right",
      title: "Terminals",
      order: 10,
      lazyMount: true,
      component: () => (
        <TerminalMonitorPanel
          ctx={ctx}
          iconChoices={iconChoices}
          setIconChoice={setIconChoice}
        />
      ),
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

export const extension: Extension = {
  id: "silo.terminal-monitor",
  activate,
  deactivate,
};
